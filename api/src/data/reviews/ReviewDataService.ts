import { EventEmitter } from "events";
import { Pool } from "pg";
import { getLogger } from "../../logger";
import { DataAccessLayer } from "../dal";
import { SystemPropertyFilter, SystemPropertyValue } from "../system-property";
import { Review, ReviewStatus } from "./Review";
import { reviewerProvider } from "./ReviewerProvider";
import { ReviewSystemCompliance } from "./ReviewSystemCompliance";

export function convertToReview(row: any): Review {
  const review = new Review(row.model_id, row.requested_by, row.status);
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
  return review;
}

export function validStatus(newStatus: string): boolean {
  return Object.values<string>(ReviewStatus).includes(newStatus);
}

interface ReviewListFilter {
  statuses?: ReviewStatus[];
  properties?: SystemPropertyFilter[];
  requestedBy?: string;
  reviewedBy?: string;
  systemIds?: string[];
}

export interface ReviewListResultItem extends Partial<Review> {
  model: {
    version: string;
    systemId: string;
  };
  systemProperties: SystemPropertyValue[];
}

interface ReviewListResult {
  total: number;
  items: ReviewListResultItem[];
}

export class ReviewDataService extends EventEmitter {
  constructor(private pool: Pool, private dal: DataAccessLayer) {
    super();
  }

  log = getLogger("ReviewDataService");

  /**
   * Get the review object by modelId
   * @param {string} modelId - Model system identifier
   * @returns {Review}
   */
  async getByModelId(modelId: string) {
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
        meeting_requested_at
      FROM reviews
      WHERE model_id = $1::uuid AND deleted_at IS NULL
    `;
    const res = await this.pool.query(query, [modelId]);

    if (res.rows.length === 0) {
      return null;
    }

    return convertToReview(res.rows[0]);
  }

  async list(
    filters: ReviewListFilter,
    page?: number,
    dateOrder?: "ASC" | "DESC"
  ): Promise<ReviewListResult> {
    const params = [];
    let pi = 1;
    const statements = ["r.deleted_at IS NULL", "m.deleted_at IS NULL"];

    let systems = new Set();

    if (filters.systemIds && filters.systemIds.length > 0) {
      filters.systemIds.map((sid) => systems.add(sid));
    }

    if (filters.properties && filters.properties.length > 0) {
      // This might not scale well if filtering returns a lot of systems.
      const systemsFromProperties = Array.from(
        await this.dal.sysPropHandler.listSystemsByFilters(filters.properties)
      );
      systems = new Set(
        systemsFromProperties.filter(
          (sid) => !filters.systemIds || systems.has(sid)
        )
      );
    }

    if (systems.size > 0) {
      statements.push(
        `m.system_id IN (${Array.from(systems)
          .map(() => `$${pi++}::varchar`)
          .join(", ")})`
      );
      Array.from(systems).forEach((sys) => params.push(sys));
    }

    if (filters.statuses && filters.statuses.length > 0) {
      statements.push(
        `status IN (${filters.statuses
          .map(() => `$${pi++}::varchar`)
          .join(", ")})`
      );
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

    let res = await this.pool.query(totalQuery, params);
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
      LIMIT ${pagesize} ${
      page && page > 0 ? `OFFSET ${(page - 1) * pagesize}` : ""
    }
    `;

    res = await this.pool.query(query, params);

    return {
      total,
      items: await Promise.all(
        res.rows.map(async (row) => {
          const review = convertToReview(row);
          return {
            ...review,
            model: {
              version: row.model_version,
              systemId: row.model_system_id,
            },
            systemProperties: await this.dal.sysPropHandler.contextualize(
              row.model_system_id,
              true
            ),
          };
        })
      ),
    };
  }

  async getComplianceForSystems(
    systemIds: string[]
  ): Promise<ReviewSystemCompliance[]> {
    if (systemIds.length === 0) {
      return [];
    }

    let pi = 1;
    const statements: string[] = [];

    statements.push(
      `m.system_id IN (${Array.from(systemIds)
        .map(() => `$${pi++}::varchar`)
        .join(", ")})`
    );

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

    const res = await this.pool.query(query, systemIds);
    return res.rows.map(
      (row) =>
        new ReviewSystemCompliance(
          row.system_id,
          row.approved_model_id,
          row.approved_at,
          row.pending_model_id,
          row.pending_model_status,
          row.no_review_model_id
        )
    );
  }

  /**
   * Create the review object
   * @param {Review} review - Review creation object
   * @returns {string}
   */
  async create(review: Review) {
    const query = `
     INSERT INTO reviews (model_id, requested_by, reviewed_by, status, note)
     VALUES ($1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar)
     ON CONFLICT (model_id) DO 
        UPDATE SET requested_by = $2::varchar, reviewed_by = $3::varchar, status = $4::varchar, note = $5::varchar, 
        requested_at = now(), meeting_requested_at = null, meeting_requested_reminder_sent_count = 0, requested_reminder_sent_count = 0;
    `;
    const { modelId, requestedBy, reviewedBy, status, note } = review;

    await this.dal.notificationService.queue({
      templateKey: "review-requested",
      params: {
        review,
      },
    });

    await this.pool.query(query, [
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
  }

  async cancel(modelId: string) {
    return await this.update(modelId, {
      status: ReviewStatus.Canceled,
      reviewedBy: null,
      requestedBy: null,
    });
  }

  async decline(modelId: string, note?: string) {
    return await this.update(modelId, {
      status: ReviewStatus.Declined,
      reviewedBy: (await reviewerProvider.getFallbackReviewer()).sub,
      note: note,
    });
  }

  async approve(modelId: string, approvingUser?: string, note?: string) {
    const review = await this.update(modelId, {
      status: ReviewStatus.Approved,
      reviewedBy: approvingUser,
      note: note,
    });
    if (!review) {
      this.log.error(`No review exists for ${modelId}`);
      return review;
    }

    await this.dal.notificationService.queue({
      templateKey: "review-approved",
      params: {
        review,
      },
    });

    return review;
  }

  async changeReviewer(modelId: string, newReviewer?: string) {
    const oldReview = await this.getByModelId(modelId);

    if (oldReview === null) {
      this.log.warn(
        `A call was made to change reviewer on a non-existent review object`
      );
      return null;
    }

    if (oldReview.reviewedBy === newReviewer) {
      return oldReview;
    }

    const review = await this.update(modelId, {
      reviewedBy: newReviewer,
    });
    if (!review) {
      this.log.error(`No review exists for ${modelId}`);
      return review;
    }

    await this.dal.notificationService.queue({
      templateKey: "review-reviewer-changed",
      params: {
        review,
        previousReviewer: oldReview.reviewedBy,
      },
    });

    return review;
  }

  async requestMeeting(modelId: string, requestingUser?: string) {
    const review = await this.update(modelId, {
      status: ReviewStatus.MeetingRequested,
      reviewedBy: requestingUser,
    });
    if (!review) {
      this.log.error(`No review exists for ${modelId}`);
      return review;
    }

    await this.dal.notificationService.queue({
      templateKey: "review-meeting-requested",
      params: {
        review,
      },
    });

    return review;
  }

  async update(
    modelId: string,
    fields: {
      status?: ReviewStatus;
      reviewedBy?: string | null;
      requestedBy?: string | null;
      note?: string;
    }
  ) {
    const fieldStatements = [];
    const params = [];

    if (fields.status !== undefined) {
      params.push(fields.status);
      fieldStatements.push(`status = $${params.length}`);
      if (fields.status === ReviewStatus.Approved) {
        fieldStatements.push(`approved_at = now()`);
      } else if (fields.status === ReviewStatus.MeetingRequested) {
        fieldStatements.push(`meeting_requested_at = now()`);
      } else if (fields.status === ReviewStatus.Canceled) {
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

    if (params.length === 0) return false;

    params.push(modelId);
    const query = `
      UPDATE reviews
      SET ${fieldStatements.join(", ")}, updated_at = now()
      WHERE model_id = $${params.length}::uuid
      RETURNING *;
    `;

    const res = await this.pool.query(query, params);

    if (res.rowCount > 0) {
      this.emit("updated-for", {
        modelId,
      });
      return convertToReview(res.rows[0]);
    }
    return false;
  }
}
