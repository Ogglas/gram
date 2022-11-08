import { User } from "./User";

export type Reviewer = User & {
  recommended: boolean;
  calendarLink?: string;
};
