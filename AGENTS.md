# Project Rules for Antigravity

## üì¶ Stack
- Build: Vite 6.x
- Language: TypeScript (strict: true)
- Package Manager: npm (lockfile: package-lock.json)
- Linter/Formatter: ESLint + Prettier

## üõ†Ô∏è Workflow Rules
1. Always run `npm run lint` and `npm run typecheck` before committing
2. Never modify `vite.config.ts` without explicit instruction
3. Keep components in `src/`, split by feature
4. Use `.env` for secrets, never hardcode URLs or keys
5. Follow existing naming conventions (camelCase for vars, PascalCase for components)

## üß™ Testing & Validation
- If tests exist: run `npm run test` after code changes
- If no tests: generate basic Vitest/Playwright setup on request
- Always verify dev server starts: `npm run dev -- --port 5173`

## ü§ù Interaction Style
- Return diffs, not full files unless requested
- Explain breaking changes briefly
- Ask for clarification if requirements are ambiguous

# Global Rules

<!-- Shareable template. Personal/machine-specific rules (MCP setup, local tools, custom skills) removed. -->

## Communication

1. **Always respond in Russian.** Technical terms and code identifiers stay in their original form. These rules themselves are written in English for clarity, but user-facing answers must be in Russian.

## Development Workflow

2. **Before writing any code, describe your approach and wait for approval.** Ask clarifying questions if requirements are ambiguous. If multiple valid interpretations exist, present them ó don't pick one silently. If a simpler approach exists, say so. Push back when warranted.

3. **If a task requires changes to more than 3 files, stop and break it into smaller tasks first.**

4. **Minimum work that solves the problem. Nothing speculative.** ("Work" here = any change: code, text, spreadsheets, data.) No features or content beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No handling for impossible scenarios. If you produce 4x more than needed, cut it down. Ask yourself: "Would a senior reviewer say this is overcomplicated?" If yes, simplify.

5. **Turn tasks into verifiable goals. For multi-step work, state a brief plan with a verification check per step.** Examples:
    - "Add validation" > "Write tests for invalid inputs, then make them pass."
    - "Fix the bug" > "Write a test that reproduces it, then fix until the test passes." This overrides rule 2 ó no approval needed for the reproducing test itself.
    - "Refactor X" > "Ensure tests pass before and after."

6. **After making changes, list what could break and suggest how to verify it.** For code, that means tests; for documents, spreadsheets, or data, that means manual checks of formulas, references, and formatting.

7. **Surgical changes only.** Touch only what the task requires. Don't refactor or "improve" adjacent content (code, style, comments, wording, formatting), don't delete anything that existed before you ó mention it instead. Clean up only orphans your own changes created. Every change must trace directly to the user's request.

8. **Don't fight the same error twice blindly.** If the same error appears a second time, search the web for 3ñ5 possible fixes, pick the most effective, and implement it.

9. **When corrected on a recurring pattern, add a rule here.** Only add rules that apply globally across projects. One-off fixes don't belong here. **For deterministic requirements (lint/format/security gates, environment setup), prefer an automated gate or hook over a rule here ó rules are advisory (~80% compliance), automated gates are guaranteed.**

10. **Never push or amend commits unless explicitly asked.** Commits after completing work are fine, but push and amend are destructive ó always confirm first.

## Security

11. **Use pnpm instead of npm or yarn for JavaScript dependency management wherever practical.** Configure pnpm with `minimumReleaseAge: 2880` so newly published package versions cannot be installed until they are at least 48 hours old. Defends against supply-chain attacks via instant publication of malicious versions.
