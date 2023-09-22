import { Reviewer } from "../../auth/models/Reviewer";
import { Provider } from "../providers/Provider";
import Model from "../models/Model";
import { RequestContext } from "../providers/RequestContext";

export interface ReviewerProvider extends Provider {
  /**
   * Lookup a list of users by ID.
   *
   * @param ctx
   * @param userIds list of userIDs
   */
  lookup(ctx: RequestContext, userIds: string[]): Promise<Reviewer[]>;

  /**
   * Given a Threat Model object, return a list of reviewers
   * that can review the model.
   *
   * @param ctx
   * @param model
   */
  getReviewersForModel(ctx: RequestContext, model: Model): Promise<Reviewer[]>;

  /**
   * Return all possible Reviewers
   * @param ctx
   */
  getReviewers(ctx: RequestContext): Promise<Reviewer[]>;

  /**
   * Return a fallback reviewer, used for e.g. reassignment.
   * @param ctx
   */
  getFallbackReviewer(ctx: RequestContext): Promise<Reviewer | null>;
}
