import claude from "./claude.js";
import codex from "./codex.js";
import ollama from "./ollama.js";
import synthetic from "./synthetic.js";
import neuralwatt from "./neuralwatt.js";
import opencode from "./opencode.js";
import pi from "./pi.js";

// Order here is the order in the status bar and the settings popup.
export const PROVIDERS = [claude, codex, ollama, synthetic, neuralwatt, opencode, pi];
