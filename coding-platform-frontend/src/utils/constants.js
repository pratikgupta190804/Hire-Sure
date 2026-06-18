export const API = import.meta.env.VITE_BACKEND_API_URL;

export const LANGUAGES = [
  { id: 71, name: "Python 3" },
  { id: 62, name: "Java" },
  { id: 54, name: "C++" },
  { id: 63, name: "JavaScript" },
  { id: 50, name: "C" },
  { id: 73, name: "Rust" },
];

export const LANG_STARTERS = {
  71: `n = int(input())\n# your solution here\n`,
  62: `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // your solution here\n    }\n}`,
  54: `#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // your solution here\n    return 0;\n}`,
  63: `const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\n// your solution here`,
  50: `#include <stdio.h>\nint main() {\n    // your solution here\n    return 0;\n}`,
  73: `use std::io::{self, BufRead};\nfn main() {\n    let stdin = io::stdin();\n    // your solution here\n}`,
};