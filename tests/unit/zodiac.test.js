import { describe, it, expect } from "vitest";
import { Zodiac } from "../../src/lib/zodiac.js";

describe("Zodiac.getWesternZodiac boundaries", () => {
    const cases = [
        [[1, 19], "Capricorn"], [[1, 20], "Aquarius"],
        [[2, 18], "Aquarius"], [[2, 19], "Pisces"],
        [[3, 20], "Pisces"],   [[3, 21], "Aries"],
        [[4, 19], "Aries"],    [[4, 20], "Taurus"],
        [[5, 20], "Taurus"],   [[5, 21], "Gemini"],
        [[6, 20], "Gemini"],   [[6, 21], "Cancer"],
        [[7, 22], "Cancer"],   [[7, 23], "Leo"],
        [[8, 22], "Leo"],      [[8, 23], "Virgo"],
        [[9, 22], "Virgo"],    [[9, 23], "Libra"],
        [[10, 22], "Libra"],   [[10, 23], "Scorpio"],
        [[11, 21], "Scorpio"], [[11, 22], "Sagittarius"],
        [[12, 21], "Sagittarius"], [[12, 22], "Capricorn"]
    ];
    for (let [[m, d], expected] of cases) {
        it(`${m}/${d} -> ${expected}`, () => {
            let date = new Date(2026, m - 1, d);
            expect(Zodiac.getWesternZodiac(date).name).toBe(expected);
        });
    }

    it("January 1 wraps back to Capricorn", () => {
        expect(Zodiac.getWesternZodiac(new Date(2026, 0, 1)).name).toBe("Capricorn");
    });
});

describe("Zodiac.getChineseZodiac", () => {
    it("2020 is the Rat anchor year (index 0)", () => {
        let z = Zodiac.getChineseZodiac(2020, 6, 1);
        expect(z.animalKey).toBe("Rat");
        expect(z.animalIndex).toBe(0);
    });

    it("cycles the animal every 12 years", () => {
        let z2032 = Zodiac.getChineseZodiac(2032, 6, 1);
        expect(z2032.animalKey).toBe("Rat");
    });

    it("uses the previous year before the Feb 5 cutover", () => {
        let beforeCutover = Zodiac.getChineseZodiac(2021, 2, 4);
        let afterCutover  = Zodiac.getChineseZodiac(2021, 2, 5);
        expect(beforeCutover.animalKey).toBe("Rat");   // still 2020's animal
        expect(afterCutover.animalKey).toBe("Ox");     // 2021's animal
    });

    it("returns a 5-element cycle for element", () => {
        let seen = new Set();
        for (let y = 2020; y < 2030; y++) {
            seen.add(Zodiac.getChineseZodiac(y, 6, 1).elementKey);
        }
        expect(seen.size).toBe(5);
    });
});
