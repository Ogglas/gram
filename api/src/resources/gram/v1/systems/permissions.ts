/**
 * GET /api/v1/models/<id>/permissions
 * @exports {function} handler
 */

import { Request, Response } from "express";
import { getPermissionsForSystem } from "../../../../auth/authorization";

export default async (req: Request, res: Response) => {
  const permissions = await getPermissionsForSystem(
    { currentRequest: req },
    req.params.id,
    req.user
  );
  return res.json({ permissions });
};
