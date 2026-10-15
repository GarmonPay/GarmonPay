import { afterEach, describe, expect, it, vi } from "vitest";
import { emitCeloSound, subscribeCeloSound } from "./celo-sound-events";
import { scheduleCeloDiceImpacts, subscribeCeloDiceImpact } from "./celo-dice-audio";
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("C-Lo presentation audio",()=>{
 it("subscribes and releases without changing result data",()=>{const listener=vi.fn();const off=subscribeCeloSound(listener);emitCeloSound("release");off();emitCeloSound("win");expect(listener).toHaveBeenCalledExactlyOnceWith("release");});
 it("audio listener failures cannot interrupt gameplay",()=>{const off=subscribeCeloSound(()=>{throw new Error("audio unavailable");});expect(()=>emitCeloSound("shake")).not.toThrow();off();});
 it("aligns impact sounds with the animation timeline and allows cancellation",()=>{vi.useFakeTimers();vi.stubGlobal("window",{setTimeout});const listener=vi.fn();const off=subscribeCeloDiceImpact(listener);const timers=scheduleCeloDiceImpacts(1200);vi.advanceTimersByTime(190);expect(listener).not.toHaveBeenCalled();vi.advanceTimersByTime(2);expect(listener).toHaveBeenCalledExactlyOnceWith("felt",0);timers.forEach(clearTimeout);vi.advanceTimersByTime(2000);expect(listener).toHaveBeenCalledTimes(1);off();});
});
