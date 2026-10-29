import { describe, expect, it } from "vitest";
import { profileCard, riskGap, score, type Answers } from "../src/profile/questions";

const all = (horizon: string, cushion: string, drop: string, experience: string, style: string): Answers => ({ horizon, cushion, drop, experience, style });

describe("risk profile", () => {
  it("long horizon, solid cushion and a taste for risk is adventurous", () => {
    expect(score(all("long", "yes", "buy", "years", "big")).risk).toBe("adventurous");
  });

  it("the lower of willingness and capacity wins", () => {
    const eagerButStretched = score(all("mid", "no", "buy", "years", "big"));
    expect(eagerButStretched.willingness).toBe(2);
    expect(eagerButStretched.capacity).toBe(0);
    expect(eagerButStretched.risk).toBe("cautious");
    expect(profileCard(eagerButStretched, "Ama")).toContain("appetite for more");

    const ableButNervous = score(all("long", "yes", "sell", "new", "steady"));
    expect(ableButNervous.risk).toBe("cautious");
    expect(profileCard(ableButNervous, null)).toContain("can't sleep with");
  });

  it("a typical middle answer is balanced", () => {
    expect(score(all("long", "maybe", "wait", "some", "balanced")).risk).toBe("balanced");
  });

  it("money needed within a year is always cautious", () => {
    const p = score(all("soon", "yes", "buy", "years", "big"));
    expect(p.risk).toBe("cautious");
    expect(profileCard(p, null)).toContain("within a year");
  });

  it("flags a mandate riskier than the profile, not a safer one", () => {
    expect(riskGap("cautious", "adventurous")).toContain("more adventurous");
    expect(riskGap("balanced", "cautious")).toBeNull();
  });
});
