import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist-tsc` holds `tsc`'s emit. It is ignored here *and* excluded in
  // tsconfig: when declaration output for the whole source tree sat in `dist`,
  // the typed-lint project service intermittently resolved types through those
  // stale `.d.ts` files instead of the sources, and `pnpm lint` failed roughly
  // one run in three with "a type that cannot be resolved".
  // `ml/.venv` is the Python training virtualenv. Several of its packages ship
  // bundled browser JS (torch's model_dump viewer, for one), which lints as
  // thousands of errors in code nobody here wrote or maintains.
  // `.claude/worktrees` and `worktrees` both hold agent worktrees: whole extra
  // checkouts of this repo. Git ignores them per-machine
  // (`.git/info/exclude`), which eslint does not read, and linting a few dozen
  // copies of the source tree with the typed project service exhausted the
  // heap. Both roots are named because both get used: the tooling writes to
  // `.claude/worktrees`, and a worktree made by hand lands wherever it was
  // asked for -- most often a plain `worktrees/` beside it. `.scratch` is the throwaway-probe dir
  // from `.gitignore`; it is outside every tsconfig, so the typed project
  // service fails to parse anything left in it. Both are in `.prettierignore`.
  {
    ignores: [
      "dist/**",
      "dist-tsc/**",
      "node_modules/**",
      "ml/.venv/**",
      "research/system1/.venv/**",
      ".claude/worktrees/**",
      "worktrees/**",
      ".scratch/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the serialized engine RNG.",
        },
      ],
    },
  },
  // Package layering, held by lint rather than by review.
  //
  // `check-browser-exports.ts` already guards the browser boundary this way;
  // these are the same idea for the workspace graph. The layers, leaves first:
  //
  //   protocol            <- nothing
  //   cards               <- protocol
  //   decks               <- cards, protocol
  //   engine-core         <- cards, protocol
  //   agents              <- engine-core and below
  //   web, cli, tools     <- anything
  //
  // A drive-by import that inverts one of these compiles fine and is invisible
  // in review, which is how the rules kernel came to depend on the shipped deck
  // catalog in the first place (see `docs/maintainability-review.md` §7). Adding
  // a package here is deliberate; loosening a line should be argued for in the
  // commit that does it.
  ...layerZones({
    protocol: [],
    cards: ["protocol"],
    decks: ["cards", "protocol"],
    "engine-core": ["cards", "protocol"],
    agents: ["cards", "decks", "engine-core", "protocol"],
  }),
);

/**
 * One `no-restricted-imports` block per package, banning every workspace
 * package that is not in its allow-list.
 */
function layerZones(allowed) {
  const packages = [
    "agents",
    "cards",
    "cli",
    "decks",
    "engine-core",
    "protocol",
    "web",
  ];
  return Object.entries(allowed).map(([name, allows]) => ({
    files: [`packages/${name}/src/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: packages
            .filter((other) => other !== name && !allows.includes(other))
            .map((other) => ({
              group: [`@one-piece-sim/${other}`, `@one-piece-sim/${other}/*`],
              message: `${name} sits below ${other} in the layering; see the note in eslint.config.js.`,
            })),
        },
      ],
    },
  }));
}
