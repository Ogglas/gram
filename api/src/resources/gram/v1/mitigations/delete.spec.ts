import request from "supertest";
import * as jwt from "@gram/core/dist/auth/jwt";
import Control from "@gram/core/dist/data/controls/Control";
import { DataAccessLayer } from "@gram/core/dist/data/dal";
import Mitigation from "@gram/core/dist/data/mitigations/Mitigation";
import Model from "@gram/core/dist/data/models/Model";
import Threat from "@gram/core/dist/data/threats/Threat";
import { _deleteAllTheThings } from "@gram/core/dist/data/utils";
import { createTestApp } from "../../../../test-util/app";
import { sampleOwnedSystem } from "../../../../test-util/sampleOwnedSystem";
import { sampleUser } from "../../../../test-util/sampleUser";

describe("Mitigations.delete", () => {
  const validate = jest.spyOn(jwt, "validateToken");

  let app: any;
  let pool: any;
  const email = "test@abc.xyz";
  const componentId = "fe93572e-9d0c-4afe-b042-e02c1c45f704";
  let modelId: string;
  let threatId: string;
  let controlId: string;
  let control: Control;
  let threat: Threat;
  let mitigation: Mitigation;
  let dal: DataAccessLayer;

  beforeAll(async () => {
    ({ pool, app, dal } = await createTestApp());
  });

  beforeEach(async () => {
    validate.mockImplementation(async () => sampleUser);

    const model = new Model(sampleOwnedSystem.id, "version", email);
    model.data = { components: [], dataFlows: [] };
    modelId = await dal.modelService.create(model);

    threat = new Threat(
      "Threat",
      "threat description",
      modelId,
      componentId,
      email
    );
    threatId = await dal.threatService.create(threat);

    control = new Control(
      "Control",
      "control description",
      false,
      modelId,
      componentId,
      email
    );
    controlId = await dal.controlService.create(control);

    mitigation = new Mitigation(threatId, controlId, email);
    await dal.mitigationService.create(mitigation);
  });

  it("should return 401 on un-authenticated request", async () => {
    const res = await request(app)
      .delete(`/api/v1/models/${modelId}/mitigations`)
      .send({ threatId, controlId });
    expect(res.status).toBe(401);
  });

  it("should return 200 on delete", async () => {
    const res = await request(app)
      .delete(`/api/v1/models/${modelId}/mitigations`)
      .set("Authorization", "bearer validToken")
      .send({ threatId, controlId });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual(true);
  });

  afterAll(async () => {
    validate.mockRestore();
    await _deleteAllTheThings(pool);
  });
});
