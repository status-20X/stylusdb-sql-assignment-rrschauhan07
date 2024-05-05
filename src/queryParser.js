function parseSelectQuery(query) {
  try {
    query = query.trim();
    let isDistinct = false;
    if (query.toUpperCase().includes("SELECT DISTINCT")) {
      isDistinct = true;
      query = query.replace("SELECT DISTINCT", "SELECT");
    }

    // Split the Query by LIMIT clause
    const limitSplit = query.split(/\sLIMIT\s/i);
    const queryWithoutlimit = limitSplit[0];

    let limit = limitSplit.length > 1 ? parseInt(limitSplit[1].trim()) : null;

    // Split the Query st ORDER BY clause
    const orderBySplit = queryWithoutlimit.split(/\sORDER BY\s/i);
    const queryWithoutOrderBy = orderBySplit[0];

    let orderByFields =
      orderBySplit.length > 1
        ? orderBySplit[1]
            .trim()
            .split(",")
            .map((field) => {
              const [fieldName, order] = field.trim().split(/\s+/);
              return { fieldName, order: order ? order.toUpperCase() : "ASC" };
            })
        : null;

    // Split the query at the GROUP BY clause if it exists
    const groupBySplit = queryWithoutOrderBy.split(/\sGROUP BY\s/i);
    const queryWithoutGroupBy = groupBySplit[0]; // Everything before GROUP BY clause

    // GROUP BY clause is the second part after splitting, if it exists
    let groupByFields =
      groupBySplit.length > 1
        ? groupBySplit[1]
            .trim()
            .split(",")
            .map((field) => field.trim())
        : null;

    // Split the query at the WHERE clause if it exists
    const whereSplit = queryWithoutGroupBy.split(/\sWHERE\s/i);
    const queryWithoutWhere = whereSplit[0]; // Everything before WHERE clause

    // WHERE clause is the second part after splitting, if it exists
    const whereClause = whereSplit.length > 1 ? whereSplit[1].trim() : null;

    // Split the remaining query at the JOIN clause if it exists
    const joinSplit = queryWithoutWhere.split(/\s(INNER|LEFT|RIGHT) JOIN\s/i);

    const selectPart = joinSplit[0].trim(); // Everything before JOIN clause

    // Parse the SELECT part
    const selectRegex = /^SELECT\s(.+?)\sFROM\s(.+)/i;
    const selectMatch = selectPart.match(selectRegex);

    if (!selectMatch) {
      throw new Error(
        "Error executing query: Query parsing error: Invalid SELECT format"
      );
    }

    const [, fields, table] = selectMatch;

    // Extract JOIN information
    const { joinType, joinTable, joinCondition } =
      parseJoinClause(queryWithoutWhere);

    // Parse the WHERE part if it exists
    let whereClauses = [];
    if (whereClause) {
      whereClauses = parseWhereClause(whereClause);
    }

    // Check for the presence of aggregate functions without GROUP BY
    const aggregateFunctionRegex =
      /(\bCOUNT\b|\bAVG\b|\bSUM\b|\bMIN\b|\bMAX\b)\s*\(\s*(\*|\w+)\s*\)/i;
    const hasAggregateWithoutGroupBy =
      aggregateFunctionRegex.test(query) && !groupByFields;

    return {
      fields: fields.split(",").map((field) => field.trim()),
      table: table.trim(),
      whereClauses,
      joinType,
      joinTable,
      joinCondition,
      groupByFields,
      hasAggregateWithoutGroupBy,
      orderByFields,
      limit,
      isDistinct,
    };
  } catch (error) {
    console.log(error);
    throw new Error(`Query parsing error: ${error.message}`);
  }
}

function parseInsertQuery(query) {
  const insertRegex = /INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/;

  const inserMatch = query.match(insertRegex);

  if (inserMatch) {
    const [, table, columns, values] = inserMatch;
    const columnList = columns.split(",").map((field) => field.trim());
    const valueList = values.match(/'([^']+)'/g).map((val) => val);

    return (result = {
      type: "INSERT",
      table: table.trim(),
      columns: columnList,
      values: valueList,
    });
  } else {
    console.log("No match found");
    throw new Error("Query Parsing Error : INSERT Query has inavlid format.");
  }
}

function parseDeleteQuery(query) {
  const deleteRegex = /DELETE FROM\s+(\w+)\s+WHERE\s+(.+)/;
  const deleteMatch = query.match(deleteRegex);

  if (deleteMatch) {
    const [, table, whereString] = deleteMatch;
    const whereClauses = parseWhereClause(whereString);

    return {
      type: "DELETE",
      table,
      whereClauses,
    };
  } else {
    throw new Error("Query Parsing Error: Invalid DELETE format");
  }
}

function parseWhereClause(whereString) {
  const conditionRegex = /(.*?)(=|!=|>|<|>=|<=)(.*)/;
  return whereString.split(/ AND | OR /i).map((conditionString) => {
    if (conditionString.includes("LIKE")) {
      const [field, pattern] = conditionString.split(/\sLIKE\s/i);
      return { field: field.trim(), operator: "LIKE", value: pattern.trim() };
    }
    const match = conditionString.match(conditionRegex);
    if (match) {
      const [, field, operator, value] = match;
      return { field: field.trim(), operator, value: value.trim() };
    }
    throw new Error("Invalid WHERE clause format");
  });
}

function parseJoinClause(query) {
  const joinRegex =
    /\s(INNER|LEFT|RIGHT) JOIN\s(.+?)\sON\s([\w.]+)\s*=\s*([\w.]+)/i;
  const joinMatch = query.match(joinRegex);

  if (joinMatch) {
    return {
      joinType: joinMatch[1].trim(),
      joinTable: joinMatch[2].trim(),
      joinCondition: {
        left: joinMatch[3].trim(),
        right: joinMatch[4].trim(),
      },
    };
  }

  return {
    joinType: null,
    joinTable: null,
    joinCondition: null,
  };
}

module.exports = {
  parseSelectQuery,
  parseJoinClause,
  parseInsertQuery,
  parseDeleteQuery,
};