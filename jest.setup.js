// Fix BigInt serialization globally
const originalStringify = JSON.stringify;
JSON.stringify = function (value) {
  return originalStringify(value, (key, val) =>
    typeof val === "bigint" ? val.toString() : val
  );
};