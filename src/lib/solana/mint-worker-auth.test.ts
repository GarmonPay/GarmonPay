import { describe, expect, it } from "vitest";
import { workerHeaders, verifyWorkerRequest } from "./mint-worker-auth";
import { readFileSync } from "node:fs";
describe("private mint worker boundary", () => {
 const key = "k".repeat(43), now = 1791990000000;
 it("authenticates an exact body once and rejects replay, tampering and expired capabilities", () => {
  const body = '{"action":"status"}', seen = new Map<string,number>();
  const h = new Headers(workerHeaders(body,key,now));
  expect(verifyWorkerRequest(body,h,key,seen,now)).toBe(true);
  expect(verifyWorkerRequest(body,h,key,seen,now)).toBe(false);
  expect(verifyWorkerRequest(body+' ',h,key,new Map(),now)).toBe(false);
  expect(verifyWorkerRequest(body,h,key,new Map(),now+31000)).toBe(false);
  expect(verifyWorkerRequest(body,new Headers(),key,new Map(),now)).toBe(false);
  expect(verifyWorkerRequest(body,h,'x'.repeat(43),new Map(),now)).toBe(false);
 });
 it("validates the full signed LaunchLab message before any broadcast", () => {
  const source=readFileSync(new URL('./devnet-completion.ts',import.meta.url),'utf8');
  expect(source.indexOf('assertSignedDevnetLaunch(transaction,')).toBeLessThan(source.indexOf('await sendExactSignedTransaction('));
 });
});
