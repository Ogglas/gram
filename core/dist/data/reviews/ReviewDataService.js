"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewDataService = exports.validStatus = exports.convertToReview = void 0;
const events_1 = require("events");
const logger_1 = require("../../logger");
const Review_1 = require("./Review");
const ReviewerProvider_1 = require("./ReviewerProvider");
const ReviewSystemCompliance_1 = require("./ReviewSystemCompliance");
function convertToReview(row) {
    const review = new Review_1.Review(row.model_id, row.requested_by, row.status);
    review.note = row.note;
    review.createdAt = row.created_at;
    review.updatedAt = row.updated_at;
    review.requestedBy = row.requested_by;
    review.reviewedBy = row.reviewed_by;
    review.approvedAt = row.approved_at;
    review.requestedAt = row.requested_at;
    review.meetingRequestedAt = row.meeting_requested_at;
    review.meetingRequestedReminderSentCount =
        row.meeting_requested_reminder_sent_count;
    if (row.extras)
        review.extras = row.extras;
    return review;
}
exports.convertToReview = convertToReview;
function validStatus(newStatus) {
    return Object.values(Review_1.ReviewStatus).includes(newStatus);
}
exports.validStatus = validStatus;
class ReviewDataService extends events_1.EventEmitter {
    constructor(pool, dal) {
        super();
        this.pool = pool;
        this.dal = dal;
        this.log = (0, logger_1.getLogger)("ReviewDataService");
    }
    /**
     * Get the review object by modelId
     * @param {string} modelId - Model system identifier
     * @returns {Review}
     */
    getByModelId(modelId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = `
      SELECT        
        model_id,
        requested_by,
        reviewed_by,
        status,
        note,
        created_at,
        updated_at,
        approved_at,
        requested_at,
        meeting_requested_at,
        extras
      FROM reviews
      WHERE model_id = $1::uuid AND deleted_at IS NULL
    `;
            const res = yield this.pool.query(query, [modelId]);
            if (res.rows.length === 0) {
                return null;
            }
            return convertToReview(res.rows[0]);
        });
    }
    list(ctx, filters, page, dateOrder) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let pi = 1;
            const statements = ["r.deleted_at IS NULL", "m.deleted_at IS NULL"];
            let systems = new Set();
            if (filters.systemIds && filters.systemIds.length > 0) {
                filters.systemIds.map((sid) => systems.add(sid));
            }
            if (filters.properties && filters.properties.length > 0) {
                // This might not scale well if filtering returns a lot of systems.
                const systemsFromProperties = Array.from(yield this.dal.sysPropHandler.listSystemsByFilters(ctx, filters.properties));
                systems = new Set(systemsFromProperties.filter((sid) => !filters.systemIds || systems.has(sid)));
            }
            if (systems.size > 0) {
                statements.push(`m.system_id IN (${Array.from(systems)
                    .map(() => `$${pi++}::varchar`)
                    .join(", ")})`);
                Array.from(systems).forEach((sys) => params.push(sys));
            }
            if (filters.statuses && filters.statuses.length > 0) {
                statements.push(`status IN (${filters.statuses
                    .map(() => `$${pi++}::varchar`)
                    .join(", ")})`);
                filters.statuses.forEach((s) => params.push(s));
            }
            if (filters.requestedBy) {
                statements.push(`requested_by = $${pi++}::varchar`);
                params.push(filters.requestedBy);
            }
            if (filters.reviewedBy) {
                statements.push(`reviewed_by = $${pi++}::varchar`);
                params.push(filters.reviewedBy);
            }
            const dynamicStatements = statements.join(" AND ");
            const totalQuery = `
      SELECT COUNT(*) as count
      FROM reviews r
      INNER JOIN models m ON m.id = model_id
      WHERE ${dynamicStatements}
    `;
            let res = yield this.pool.query(totalQuery, params);
            const total = parseInt(res.rows[0].count);
            const pagesize = 10;
            const query = `
      SELECT        
        r.model_id,
        r.requested_by,
        r.reviewed_by,
        r.status,
        r.note,
        r.created_at,
        r.updated_at,
        r.approved_at,
        r.meeting_requested_at,
        r.meeting_requested_reminder_sent_count,
        m.version as model_version,
        m.system_id as model_system_id
      FROM reviews r
      INNER JOIN models m ON m.id = r.model_id
      WHERE ${dynamicStatements}
      ORDER BY r.updated_at ${dateOrder === "DESC" ? "DESC" : "ASC"}
      LIMIT ${pagesize} ${page && page > 0 ? `OFFSET ${(page - 1) * pagesize}` : ""}
    `;
            res = yield this.pool.query(query, params);
            return {
                total,
                items: yield Promise.all(res.rows.map((row) => __awaiter(this, void 0, void 0, function* () {
                    const review = convertToReview(row);
                    return Object.assign(Object.assign({}, review), { model: {
                            version: row.model_version,
                            systemId: row.model_system_id,
                        }, systemProperties: yield this.dal.sysPropHandler.contextualize(ctx, row.model_system_id, true) });
                }))),
            };
        });
    }
    getComplianceForSystems(systemIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (systemIds.length === 0) {
                return [];
            }
            let pi = 1;
            const statements = [];
            statements.push(`m.system_id IN (${Array.from(systemIds)
                .map(() => `$${pi++}::varchar`)
                .join(", ")})`);
            const dynamicStatements = statements.join(" AND ");
            const query = `
      SELECT DISTINCT ON (m.system_id)
          m.system_id, 
          approved_models.model_id as approved_model_id, 
          approved_models.approved_at, 
          pending_models.model_id as pending_model_id,
          pending_models.status as pending_model_status,
          pending_models.created_at,
          pending_models.updated_at,
          no_review_models.model_id as no_review_model_id
      FROM models m
      LEFT JOIN (
          SELECT DISTINCT ON (m1.system_id) m1.id as model_id, m1.system_id, r1.approved_at as approved_at
          FROM models m1
          INNER JOIN reviews r1 ON r1.model_id = m1.id
          WHERE r1.status = 'approved' AND r1.deleted_at IS NULL AND m1.deleted_at IS NULL
          ORDER BY m1.system_id, r1.approved_at DESC
      ) approved_models on approved_models.system_id = m.system_id
      LEFT JOIN (
          SELECT DISTINCT ON (m2.system_id) m2.id as model_id, m2.system_id, r2.status, r2.created_at, r2.updated_at
          FROM models m2
          INNER JOIN reviews r2 ON r2.model_id = m2.id
          WHERE r2.status IN ('requested', 'meeting-requested') AND r2.deleted_at IS NULL AND m2.deleted_at IS NULL
          ORDER BY m2.system_id, r2.created_at DESC
      ) pending_models on pending_models.system_id = m.system_id
      LEFT JOIN (
        SELECT DISTINCT ON (m3.system_id) m3.id as model_id, m3.system_id
        FROM models m3
        LEFT JOIN reviews r3 ON r3.model_id = m3.id
        WHERE (r3.deleted_at IS NOT NULL OR r3.model_id IS NULL OR r3.status = 'canceled') AND m3.deleted_at IS NULL        
      ) no_review_models on no_review_models.system_id = m.system_id
      WHERE ${dynamicStatements}       
      ORDER BY m.system_id DESC
    `;
            const res = yield this.pool.query(query, systemIds);
            return res.rows.map((row) => new ReviewSystemCompliance_1.ReviewSystemCompliance(row.system_id, row.approved_model_id, row.approved_at, row.pending_model_id, row.pending_model_status, row.no_review_model_id));
        });
    }
    /**
     * Create the review object
     * @param {Review} review - Review creation object
     * @returns {string}
     */
    create(review) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = `
     INSERT INTO reviews (model_id, requested_by, reviewed_by, status, note)
     VALUES ($1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar)
     ON CONFLICT (model_id) DO 
        UPDATE SET requested_by = $2::varchar, reviewed_by = $3::varchar, status = $4::varchar, note = $5::varchar, 
        requested_at = now(), meeting_requested_at = null, meeting_requested_reminder_sent_count = 0, requested_reminder_sent_count = 0;
    `;
            const { modelId, requestedBy, reviewedBy, status, note } = review;
            yield this.dal.notificationService.queue({
                templateKey: "review-requested",
                params: {
                    review,
                },
            });
            yield this.pool.query(query, [
                modelId,
                requestedBy,
                reviewedBy,
                status,
                note,
            ]);
            this.emit("updated-for", {
                modelId,
            });
            return modelId;
        });
    }
    cancel(modelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.update(modelId, {
                status: Review_1.ReviewStatus.Canceled,
                reviewedBy: null,
                requestedBy: null,
            });
        });
    }
    decline(ctx, modelId, note) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.update(modelId, {
                status: Review_1.ReviewStatus.Declined,
                reviewedBy: (yield ReviewerProvider_1.reviewerProvider.getFallbackReviewer(ctx)).sub,
                note: note,
            });
        });
    }
    approve(modelId, approvingUser, note, extras) {
        return __awaiter(this, void 0, void 0, function* () {
            const review = yield this.update(modelId, {
                status: Review_1.ReviewStatus.Approved,
                reviewedBy: approvingUser,
                note: note,
                extras,
            });
            if (!review) {
                this.log.error(`No review exists for ${modelId}`);
                return review;
            }
            this.emit("approved", { review });
            yield this.dal.notificationService.queue({
                templateKey: "review-approved",
                params: {
                    review,
                },
            });
            return review;
        });
    }
    changeReviewer(modelId, newReviewer) {
        return __awaiter(this, void 0, void 0, function* () {
            const oldReview = yield this.getByModelId(modelId);
            if (oldReview === null) {
                this.log.warn(`A call was made to change reviewer on a non-existent review object`);
                return null;
            }
            if (oldReview.reviewedBy === newReviewer) {
                return oldReview;
            }
            const review = yield this.update(modelId, {
                reviewedBy: newReviewer,
            });
            if (!review) {
                this.log.error(`No review exists for ${modelId}`);
                return review;
            }
            yield this.dal.notificationService.queue({
                templateKey: "review-reviewer-changed",
                params: {
                    review,
                    previousReviewer: oldReview.reviewedBy,
                },
            });
            return review;
        });
    }
    requestMeeting(modelId, requestingUser) {
        return __awaiter(this, void 0, void 0, function* () {
            const review = yield this.update(modelId, {
                status: Review_1.ReviewStatus.MeetingRequested,
                reviewedBy: requestingUser,
            });
            if (!review) {
                this.log.error(`No review exists for ${modelId}`);
                return review;
            }
            yield this.dal.notificationService.queue({
                templateKey: "review-meeting-requested",
                params: {
                    review,
                },
            });
            return review;
        });
    }
    update(modelId, fields) {
        return __awaiter(this, void 0, void 0, function* () {
            const fieldStatements = [];
            const params = [];
            if (fields.status !== undefined) {
                params.push(fields.status);
                fieldStatements.push(`status = $${params.length}`);
                if (fields.status === Review_1.ReviewStatus.Approved) {
                    fieldStatements.push(`approved_at = now()`);
                }
                else if (fields.status === Review_1.ReviewStatus.MeetingRequested) {
                    fieldStatements.push(`meeting_requested_at = now()`);
                }
                else if (fields.status === Review_1.ReviewStatus.Canceled) {
                    fieldStatements.push(`requested_at = now()`);
                }
            }
            if (fields.reviewedBy !== undefined) {
                params.push(fields.reviewedBy);
                fieldStatements.push(`reviewed_by = $${params.length}`);
            }
            if (fields.requestedBy !== undefined) {
                params.push(fields.requestedBy);
                fieldStatements.push(`requested_by = $${params.length}`);
            }
            if (fields.note !== undefined) {
                params.push(fields.note);
                fieldStatements.push(`note = $${params.length}`);
            }
            if (fields.extras !== undefined) {
                params.push(JSON.stringify(fields.extras));
                fieldStatements.push(`extras = $${params.length}::json`);
            }
            if (params.length === 0)
                return false;
            params.push(modelId);
            const query = `
      UPDATE reviews
      SET ${fieldStatements.join(", ")}, updated_at = now()
      WHERE model_id = $${params.length}::uuid
      RETURNING *;
    `;
            const res = yield this.pool.query(query, params);
            if (res.rowCount > 0) {
                this.emit("updated-for", {
                    modelId,
                });
                return convertToReview(res.rows[0]);
            }
            return false;
        });
    }
}
exports.ReviewDataService = ReviewDataService;
//# sourceMappingURL=ReviewDataService.js.map