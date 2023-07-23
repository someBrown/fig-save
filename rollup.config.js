import cleanup from "rollup-plugin-cleanup";

export default {
  input: "src/index.js",
  output: {
    file: "dist/index.js",
    format: "es",
  },
  plugins: [
    cleanup({
      comments: "none",
    }),
  ],
};
