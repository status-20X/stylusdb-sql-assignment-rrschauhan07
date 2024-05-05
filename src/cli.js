#!/usr/bin/env node

const readline = require("readline");
const {
  executeSELECTQuery,
  executeINSERTQuery,
  executeDELETEQuery,
} = require("./queryExecutor");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.setPrompt("SQL> ");
console.log(
  'SQL Query Engine CLI. Enter your SQL commands, or type "exit" to quit.'
);

rl.prompt();

rl.on("line", async (line) => {
  if (line.toLowerCase() === "exit") {
    rl.close();
    return;
  }

  try {
    const queryRegex = /^(\S+)/;
    const queryMatch = line.match(queryRegex);

    if (queryMatch) {
      const [, action] = queryMatch;
      console.log(action);
      switch (action.toUpperCase()) {
        case "SELECT":
          await executeSELECTQuery(line);
        case "DELETE":
          await executeDELETEQuery(line);
        case "INSERT":
          await executeINSERTQuery(line);
        default:
          throw new Error(`Invalid query action : ${action} `);
      }
    } else {
      throw new Error("Please enter a valid query string");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  rl.prompt();
}).on("close", () => {
  console.log("Exiting SQL CLI");
  process.exit(0);
});