# Project Rules for Antigravity

## 📦 Stack
- Build: Vite 6.x
- Language: TypeScript (strict: true)
- Package Manager: npm (lockfile: package-lock.json)
- Linter/Formatter: ESLint + Prettier

## 🛠️ Workflow Rules
1. Always run `npm run lint` and `npm run typecheck` before committing
2. Never modify `vite.config.ts` without explicit instruction
3. Keep components in `src/`, split by feature
4. Use `.env` for secrets, never hardcode URLs or keys
5. Follow existing naming conventions (camelCase for vars, PascalCase for components)

## 🧪 Testing & Validation
- If tests exist: run `npm run test` after code changes
- If no tests: generate basic Vitest/Playwright setup on request
- Always verify dev server starts: `npm run dev -- --port 5173`

## 🤝 Interaction Style
- Return diffs, not full files unless requested
- Explain breaking changes briefly
- Ask for clarification if requirements are ambiguous