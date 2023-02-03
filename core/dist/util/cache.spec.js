"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cache_1 = __importDefault(require("./cache"));
describe("cache", () => {
    it("should get/set", () => {
        const c = new cache_1.default("test");
        c.set("key", "value");
        expect(c.get("key")).toBe("value");
    });
    it("should get null if no previous value", () => {
        const c = new cache_1.default("test");
        expect(c.get("key")).toBe(null);
    });
    it("should expire old values", () => {
        const c = new cache_1.default("test");
        c.set("key", "old stuff");
        jest
            .useFakeTimers("modern")
            .setSystemTime(Date.now() + 1000 * 60 * 60 * 3 + 2000);
        expect(c.get("key")).toBe(null);
    });
    it("should not expire too early", () => {
        const c = new cache_1.default("test");
        c.set("key", "still fresh");
        jest
            .useFakeTimers("modern")
            .setSystemTime(Date.now() + 1000 * 60 * 60 * 2 + 2000);
        expect(c.get("key")).toBe("still fresh");
    });
    it("should get null if not matching key value", () => {
        const c = new cache_1.default("test");
        c.set("other key", "yey");
        expect(c.get("key")).toBe(null);
    });
    it("should return correct result for has", () => {
        const c = new cache_1.default("test");
        expect(c.has("key")).toBe(false);
        c.set("key", "yey");
        expect(c.has("key")).toBe(true);
        expect(c.has("other key")).toBe(false);
    });
});
//# sourceMappingURL=cache.spec.js.map