import {
  generateCodeChallenge,
  generateCodeVerifier,
} from "./services/pkce.service.js";

const verifier = generateCodeVerifier();
const challenge = generateCodeChallenge(verifier);

console.log("Code Verifier:");
console.log(verifier);

console.log("\nCode Challenge:");
console.log(challenge);

console.log("\nChallenge Method:");
console.log("S256");
