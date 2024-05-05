const fs = require("fs");
const csv = require("csv-parser");

// Helper function to convert data
function convertData(data) {
  let writeContent = "";
  let rowsInserted = 0;

  data.forEach((row) => {
    for (const key in row) {
      writeContent += `${row[key]},`;
    }
    writeContent = writeContent.slice(0, -1);
    writeContent += "\n";
    rowsInserted += 1;
  });

  return { writeContent, rowsInserted };
}

function readCSV(filePath) {
  const results = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

async function writeCSV(filePath, data) {
  const { writeContent, rowsInserted } = convertData(data);

  let fields = "";

  for (const key in data[0]) {
    fields += `${key},`;
  }
  fields = fields.slice(0, -1);
  fields += "\n" + writeContent;

  fs.writeFile(filePath, fields, (err) => {
    if (err) {
      console.error(err);
    } else {
    }
  });
}

async function updateCSV(filePath, data) {
  const { writeContent, rowsInserted } = convertData(data);

  fs.appendFile(filePath, writeContent, (err) => {
    if (err) {
      console.error(err);
    } else {
    }
  });

  return { rowsInserted };
}

module.exports = { readCSV, writeCSV, updateCSV };