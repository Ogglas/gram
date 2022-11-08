import request from "supertest";
import * as jwt from "../../../../auth/jwt";
import { DataAccessLayer } from "../../../../data/dal";
import Model from "../../../../data/models/Model";
import Threat from "../../../../data/threats/Threat";
import { _deleteAllTheThings } from "../../../../data/utils";
import { createTestApp } from "../../../../test-util/app";
import { sampleOwnedSystem } from "../../../../test-util/sampleOwnedSystem";
import { sampleUser } from "../../../../test-util/sampleUser";

describe("Controls.create", () => {
  const validate = jest.spyOn(jwt, "validateToken");

  let app: any;
  let pool: any;
  let dal: DataAccessLayer;

  const email = "test@abc.xyz";
  const componentId = "fe93572e-9d0c-4afe-b042-e02c1c45f704";
  let modelId: string;
  let threatId: string;

  beforeAll(async () => {
    ({ pool, app, dal } = await createTestApp());
  });

  beforeEach(async () => {
    validate.mockImplementation(async () => sampleUser);

    const model = new Model(sampleOwnedSystem.id, "version", email);
    model.data = { components: [], dataFlows: [] };
    modelId = await dal.modelService.create(model);

    const threat = new Threat(
      "Threat",
      "threat description",
      modelId,
      componentId,
      email
    );
    threatId = await dal.threatService.create(threat);
  });

  it("should return 401 on un-authenticated request", async () => {
    const res = await request(app)
      .post(`/api/v1/models/${modelId}/controls`)
      .send({ title: "Control", description: "desc", componentId });
    expect(res.status).toBe(401);
  });

  it("should return 200", async () => {
    const res = await request(app)
      .post(`/api/v1/models/${modelId}/controls`)
      .set("Authorization", "bearer validToken")
      .send({ title: "Control", description: "desc", componentId });

    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    validate.mockRestore();
    await _deleteAllTheThings(pool);
  });
});
