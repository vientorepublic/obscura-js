// sample.js — Obscura.js obfuscation demo

const SECRET_KEY = "obscura-demo-2026";
const VERSION = "1.0.0";

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function greet(name) {
  const msg = "Hello, " + name + "! Welcome to obscura.";
  if (name === "admin") {
    console.log("Admin access granted.");
  } else {
    console.log(msg);
  }
  return msg;
}

function computeScore(x, y) {
  const base = add(x, y);
  const bonus = multiply(base, 2);
  const result = bonus - x;
  return result;
}

const score = computeScore(7, 3);
console.log("Score:", score);
console.log("Version:", VERSION);
console.log(greet("Alice"));
