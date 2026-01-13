class SolverData {
    constructor() {
        this.observations = []; // { childId, f, ff, fm, m, mf, mm, s3, s2, correctSymbol }
        this.loadFromStorage();
    }

    addObservation(data) {
        const index = this.observations.findIndex(o =>
            o.childId === data.childId &&
            o.f === data.f && o.ff === data.ff && o.fm === data.fm &&
            o.m === data.m && o.mf === data.mf && o.mm === data.mm &&
            o.s3 === data.s3 && o.s2 === data.s2
        );

        if (index !== -1) {
            this.observations[index] = data;
        } else {
            this.observations.push(data);
        }
        this.saveToStorage();
    }

    getObservations() {
        return this.observations;
    }

    clear() {
        this.observations = [];
        this.saveToStorage();
    }

    saveToStorage() {
        localStorage.setItem('solver_observations', JSON.stringify(this.observations));
    }

    loadFromStorage() {
        try {
            const data = localStorage.getItem('solver_observations');
            if (data) {
                this.observations = JSON.parse(data);
                console.log(`Loaded ${this.observations.length} observations from storage.`);
            } else {
                console.log("No data found in storage.");
                this.observations = [];
            }
        } catch (e) {
            console.error("Failed to load solver data:", e);
            this.observations = [];
        }
    }
}

class CompatibilityOptimizer {
    constructor(initialMatrix) {
        this.originalMatrix = JSON.parse(JSON.stringify(initialMatrix));
        this.matrix = JSON.parse(JSON.stringify(initialMatrix));

        this.symbolRanges = {
            "👑": { min: 660, max: 9999 },
            "☆": { min: 614, max: 659 },
            "◎": { min: 490, max: 613 },
            "○": { min: 374, max: 489 },
            "△": { min: 255, max: 373 },
            "×": { min: 0, max: 254 }
        };
    }

    getComb(youngerIdx, olderIdx, currentMatrix) {
        if (youngerIdx === null || olderIdx === null) return 0;
        if (!currentMatrix[youngerIdx]) return 0;
        return currentMatrix[youngerIdx][olderIdx] || 0;
    }

    calculateScore(childId, f, ff, fm, m, mf, mm, s3, s2, noble, matchMatrix) {
        // Safe check for missing inputs
        if ([childId, f, ff, fm, m, mf, mm].some(x => x === null || x === undefined)) return 0;

        let term1 = this.getComb(childId, f, matchMatrix);
        let term2 = Math.min(this.getComb(f, ff, matchMatrix), this.getComb(childId, ff, matchMatrix));
        let term3 = Math.min(this.getComb(f, fm, matchMatrix), this.getComb(childId, fm, matchMatrix));
        let term4 = this.getComb(childId, m, matchMatrix);
        let term5 = Math.min(this.getComb(m, mf, matchMatrix), this.getComb(childId, mf, matchMatrix));
        let term6 = Math.min(this.getComb(m, mm, matchMatrix), this.getComb(childId, mm, matchMatrix));
        let term7 = this.getComb(f, m, matchMatrix);

        let base = 224;
        let bonus = (s2 * 5) + (s3 * 12.5);
        let nobleBonus = noble || 0;

        return term1 + term2 + term3 + term4 + term5 + term6 + term7 + base + bonus + nobleBonus;
    }

    getSymbol(score) {
        if (score >= 660) return "👑";
        if (score >= 614) return "☆";
        if (score >= 490) return "◎";
        if (score >= 374) return "○";
        if (score >= 255) return "△";
        return "×";
    }

    evaluateError(currentMatrix, observations) {
        let totalPenalty = 0;
        let contradictionCount = 0;

        for (let obs of observations) {
            let score = this.calculateScore(
                obs.childId, obs.f, obs.ff, obs.fm, obs.m, obs.mf, obs.mm,
                obs.s3, obs.s2, obs.noble, currentMatrix
            );
            let targetRange = this.symbolRanges[obs.correctSymbol];

            if (!targetRange) continue;

            if (score < targetRange.min) {
                totalPenalty += (targetRange.min - score) ** 2;
                contradictionCount++;
            } else if (score > targetRange.max) {
                totalPenalty += (score - targetRange.max) ** 2;
                contradictionCount++;
            }
        }

        return { penalty: totalPenalty, contradictions: contradictionCount };
    }

    async optimize(observations, iterations = 1000, stepSize = 0.5, onProgress = null) {
        let currentMatrix = JSON.parse(JSON.stringify(this.matrix));
        let currentEval = this.evaluateError(currentMatrix, observations);

        let bestMatrix = JSON.parse(JSON.stringify(currentMatrix));
        let bestEval = currentEval;

        const numRows = currentMatrix.length;
        const numCols = currentMatrix[0].length;

        for (let i = 0; i < iterations; i++) {
            let r = Math.floor(Math.random() * numRows);
            let c = Math.floor(Math.random() * numCols);
            let originalValue = currentMatrix[r][c];

            let change = (Math.random() < 0.5 ? -1 : 1) * stepSize;
            currentMatrix[r][c] += change;
            if (currentMatrix[r][c] < 0) currentMatrix[r][c] = 0;

            let newEval = this.evaluateError(currentMatrix, observations);

            if (newEval.penalty < currentEval.penalty) {
                currentEval = newEval;
                if (newEval.penalty < bestEval.penalty) {
                    bestMatrix = JSON.parse(JSON.stringify(currentMatrix));
                    bestEval = newEval;
                }
            } else {
                currentMatrix[r][c] = originalValue;
            }

            // Yield more frequently for smoother UI updates
            if (i % 50 === 0 && onProgress) {
                await new Promise(r => setTimeout(r, 0));
                onProgress(i, iterations, currentEval);
            }
        }

        this.matrix = bestMatrix;
        return { matrix: bestMatrix, eval: bestEval };
    }
}
