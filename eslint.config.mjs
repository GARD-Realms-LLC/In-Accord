import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
    ],
  },
];

export default config;
