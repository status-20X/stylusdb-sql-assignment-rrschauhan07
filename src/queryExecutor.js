
const {
  parseSelectQuery,
  parseInsertQuery,
  parseDeleteQuery,
} = require("./queryParser");
const { readCSV, writeCSV, updateCSV } = require("./csvReader");

function performInnerJoin(data, joinData, joinCondition, fields, table) {
  return data.flatMap((mainRow) => {
    return joinData
      .filter((joinRow) => {
        const mainValue = mainRow[joinCondition.left.split(".")[1]];
        const joinValue = joinRow[joinCondition.right.split(".")[1]];
        return mainValue === joinValue;
      })
      .map((joinRow) => {
        return fields.reduce((acc, field) => {
          const [tableName, fieldName] = field.split(".");
          acc[field] =
            tableName === table ? mainRow[fieldName] : joinRow[fieldName];
          return acc;
        }, {});
      });
  });
}

function performLeftJoin(data, joinData, joinCondition, fields, table) {
  return data.flatMap((mainRow) => {
    const matchingJoinRows = joinData.filter((joinRow) => {
      const mainValue = getValueFromRow(mainRow, joinCondition.left);
      const joinValue = getValueFromRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });

    if (matchingJoinRows.length === 0) {
      return [createResultRow(mainRow, null, fields, table, true)];
    }

    return matchingJoinRows.map((joinRow) =>
      createResultRow(mainRow, joinRow, fields, table, true)
    );
  });
}

function getValueFromRow(row, compoundFieldName) {
  const [tableName, fieldName] = compoundFieldName.split(".");
  return row[`${tableName}.${fieldName}`] || row[fieldName];
}

function performRightJoin(data, joinData, joinCondition, fields, table) {
  // Cache the structure of a main table row (keys only)
  const mainTableRowStructure =
    data.length > 0
      ? Object.keys(data[0]).reduce((acc, key) => {
        acc[key] = null; // Set all values to null initially
        return acc;
      }, {})
      : {};

  return joinData.map((joinRow) => {
    const mainRowMatch = data.find((mainRow) => {
      const mainValue = getValueFromRow(mainRow, joinCondition.left);
      const joinValue = getValueFromRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });

    // Use the cached structure if no match is found
    const mainRowToUse = mainRowMatch || mainTableRowStructure;

    // Include all necessary fields from the 'student' table
    return createResultRow(mainRowToUse, joinRow, fields, table, true);
  });
}

function createResultRow(
  mainRow,
  joinRow,
  fields,
  table,
  includeAllMainFields
) {
  const resultRow = {};

  if (includeAllMainFields) {
    // Include all fields from the main table
    Object.keys(mainRow || {}).forEach((key) => {
      const prefixedKey = `${table}.${key}`;
      resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
    });
  }

  // Now, add or overwrite with the fields specified in the query
  fields.forEach((field) => {
    const [tableName, fieldName] = field.includes(".")
      ? field.split(".")
      : [table, field];
    resultRow[field] =
      tableName === table && mainRow
        ? mainRow[fieldName]
        : joinRow
          ? joinRow[fieldName]
          : null;
  });

  return resultRow;
}

function evaluateCondition(row, clause) {
  let { field, operator, value } = clause;

  // Check if the field exists in the row
  if (row[field] === undefined) {
    throw new Error(`Invalid field: ${field}`);
  }

  // Parse row value and condition value based on their actual types
  const rowValue = parseValue(row[field]);
  let conditionValue = parseValue(value);

  switch (operator) {
    case "=":
      return rowValue === conditionValue;
    case "!=":
      return rowValue !== conditionValue;
    case ">":
      return rowValue > conditionValue;
    case "<":
      return rowValue < conditionValue;
    case ">=":
      return rowValue >= conditionValue;
    case "<=":
      return rowValue <= conditionValue;
    case "LIKE":
      const regexPattern = "^" + value.slice(1, -1).replace(/%/g, ".*") + "$";
      return new RegExp(regexPattern, "i").test(row[field]);
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

// Helper function to parse value based on its apparent type
function parseValue(value) {
  // Return null or undefined as is
  if (value === null || value === undefined) {
    return value;
  }

  // If the value is a string enclosed in single or double quotes, remove them
  if (
    typeof value === "string" &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    value = value.substring(1, value.length - 1);
  }

  // Check if value is a number
  if (!isNaN(value) && value.trim() !== "") {
    return Number(value);
  }
  // Assume value is a string if not a number
  return value;
}

// Helper function to map columsn to values
function mapColumnsToValues(columns, values) {
  const mappedObjects = [];
  const numColumns = columns.length;
  const numValues = values.length;

  // Ensure values are divisible by the number of columns
  if (numValues % numColumns !== 0) {
    throw new Error("Number of values does not match the number of columns.");
  }

  // Iterate through each set of values
  for (let i = 0; i < numValues; i += numColumns) {
    const mappedObject = {};

    // Map columns to values for the current set
    for (let j = 0; j < numColumns; j++) {
      const columnName = columns[j].trim();
      const columnIndex = i + j;
      const columnValue = values[columnIndex].replace(/'/g, ""); // Remove single quotes
      mappedObject[columnName] = columnValue;
    }

    mappedObjects.push(mappedObject);
  }

  return mappedObjects;
}

function applyGroupBy(data, groupByFields, aggregateFunctions) {
  const groupResults = {};

  data.forEach((row) => {
    // Generate a key for the group
    const groupKey = groupByFields.map((field) => row[field]).join("-");

    // Initialize group in results if it doesn't exist
    if (!groupResults[groupKey]) {
      groupResults[groupKey] = { count: 0, sums: {}, mins: {}, maxes: {} };
      groupByFields.forEach(
        (field) => (groupResults[groupKey][field] = row[field])
      );
    }

    // Aggregate calculations
    groupResults[groupKey].count += 1;
    aggregateFunctions.forEach((func) => {
      const match = /(\w+)\((\w+)\)/.exec(func);
      if (match) {
        const [, aggFunc, aggField] = match;
        const value = parseFloat(row[aggField]);

        switch (aggFunc.toUpperCase()) {
          case "SUM":
            groupResults[groupKey].sums[aggField] =
              (groupResults[groupKey].sums[aggField] || 0) + value;
            break;
          case "MIN":
            groupResults[groupKey].mins[aggField] = Math.min(
              groupResults[groupKey].mins[aggField] || value,
              value
            );
            break;
          case "MAX":
            groupResults[groupKey].maxes[aggField] = Math.max(
              groupResults[groupKey].maxes[aggField] || value,
              value
            );
            break;
          // Additional aggregate functions can be added here
        }
      }
    });
  });

  // Convert grouped results into an array format
  return Object.values(groupResults).map((group) => {
    // Construct the final grouped object based on required fields
    const finalGroup = {};
    groupByFields.forEach((field) => (finalGroup[field] = group[field]));
    aggregateFunctions.forEach((func) => {
      const match = /(\w+)\((\*|\w+)\)/.exec(func);
      if (match) {
        const [, aggFunc, aggField] = match;
        switch (aggFunc.toUpperCase()) {
          case "SUM":
            finalGroup[func] = group.sums[aggField];
            break;
          case "MIN":
            finalGroup[func] = group.mins[aggField];
            break;
          case "MAX":
            finalGroup[func] = group.maxes[aggField];
            break;
          case "COUNT":
            finalGroup[func] = group.count;
            break;
          // Additional aggregate functions can be handled here
        }
      }
    });

    return finalGroup;
  });
}

async function executeSELECTQuery(query) {
  try {
    const {
      fields,
      table,
      whereClauses,
      joinType,
      joinTable,
      joinCondition,
      groupByFields,
      hasAggregateWithoutGroupBy,
      orderByFields,
      limit,
      isDistinct,
    } = parseSelectQuery(query);
    let data = await readCSV(`${table}.csv`);

    // Perform INNER JOIN if specified
    if (joinTable && joinCondition) {
      const joinData = await readCSV(`${joinTable}.csv`);
      switch (joinType.toUpperCase()) {
        case "INNER":
          data = performInnerJoin(data, joinData, joinCondition, fields, table);
          break;
        case "LEFT":
          data = performLeftJoin(data, joinData, joinCondition, fields, table);
          break;
        case "RIGHT":
          data = performRightJoin(data, joinData, joinCondition, fields, table);
          break;
        default:
          throw new Error(`Unsupported JOIN type: ${joinType}`);
      }
    }
    // Apply WHERE clause filtering after JOIN (or on the original data if no join)
    data =
      whereClauses.length > 0
        ? data.filter((row) =>
          whereClauses.every((clause) => evaluateCondition(row, clause))
        )
        : data;

    let groupResults = data;

    if (hasAggregateWithoutGroupBy) {
      // Special handling for queries like 'SELECT COUNT(*) FROM table'
      const result = {};

      fields.forEach((field) => {
        const match = /(\w+)\((\*|\w+)\)/.exec(field);
        if (match) {
          const [, aggFunc, aggField] = match;
          switch (aggFunc.toUpperCase()) {
            case "COUNT":
              result[field] = data.length;
              break;
            case "SUM":
              result[field] = data.reduce(
                (acc, row) => acc + parseFloat(row[aggField]),
                0
              );
              break;
            case "AVG":
              result[field] =
                data.reduce((acc, row) => acc + parseFloat(row[aggField]), 0) /
                data.length;
              break;
            case "MIN":
              result[field] = Math.min(
                ...data.map((row) => parseFloat(row[aggField]))
              );
              break;
            case "MAX":
              result[field] = Math.max(
                ...data.map((row) => parseFloat(row[aggField]))
              );
              break;
            // Additional aggregate functions can be handled here
          }
        }
      });

      data = [result];
      // Add more cases here if needed for other aggregates
    } else if (groupByFields) {
      groupResults = applyGroupBy(data, groupByFields, fields);
      data = groupResults;
    }

    if (orderByFields) {
      for (let { fieldName, order } of orderByFields) {
        data.sort((a, b) => {
          if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
          if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
        });
      }
    }

    // Select the specified fields
    data = data.map((row) => {
      const selectedRow = {};
      fields.forEach((field) => {
        // Assuming 'field' is just the column name without table prefix
        selectedRow[field] = row[field];
      });
      return selectedRow;
    });

    // LIMIT Clause
    if (limit !== null) {
      data = data.slice(0, limit);
    }
    // DISTINCT Clause
    if (isDistinct) {
      data = [
        ...new Map(
          data.map((item) => [
            fields.map((field) => item[field]).join("|"),
            item,
          ])
        ).values(),
      ];
    }

    return data;
  } catch (error) {
    console.error("Error executing query:", error);
    throw new Error(`Error executing query: ${error.message}`);
  }
}

async function executeINSERTQuery(query) {
  const { type, table, columns, values } = parseInsertQuery(query);

  const writeData = mapColumnsToValues(columns, values);

  return await updateCSV(`${table}.csv`, writeData);
}

async function executeDELETEQuery(query) {
  const { table, whereClauses } = parseDeleteQuery(query);
  let data = await readCSV(`${table}.csv`);
  console.log(data);
  if (whereClauses.length > 0) {
    // Filter out the rows that meet the where clause conditions

    data = data.filter(
      (row) => !whereClauses.every((clause) => evaluateCondition(row, clause))
    );
    console.log(data);
  } else {
    // If no where clause, clear the entire table
    data = [];
  }

  // Save the updated data back to the CSV file
  await writeCSV(`${table}.csv`, data);

  return { message: "Rows deleted successfully." };
}

module.exports = { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery };
