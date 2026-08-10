import globals from "globals";

const correctnessRules = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-class-assign": "error",
  "no-compare-neg-zero": "error",
  "no-constant-binary-expression": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-debugger": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-fallthrough": "error",
  "no-import-assign": "error",
  "no-loss-of-precision": "error",
  "no-new-native-nonconstructor": "error",
  "no-obj-calls": "error",
  "no-promise-executor-return": "error",
  "no-redeclare": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-this-before-super": "error",
  "no-undef": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unreachable-loop": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-labels": "error",
  "no-unused-private-class-members": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
  "no-useless-backreference": "error",
  "no-useless-catch": "error",
  "no-useless-escape": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error"
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "releases/**", "references/**", ".workbench/**"]
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node,
        unsafeWindow: "readonly",
        GM_addElement: "readonly",
        GM_xmlhttpRequest: "readonly"
      }
    },
    rules: correctnessRules
  },
  {
    files: ["test/**/*.js", "tools/**/*.js", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: correctnessRules
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      sourceType: "module"
    }
  }
];
