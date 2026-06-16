const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/home/acer/.openwork/openwork-orchestrator/openwork-dev-data/xdg/data/opencode/opencode.db');

console.log("Searching message table...");
const query1 = db.prepare("SELECT id, session_id, data FROM message WHERE data LIKE '%claim_template%' OR data LIKE '%template%'");
const rows1 = query1.all();
for (const row of rows1) {
  console.log("==========================================");
  console.log("Message ID:", row.id, "Session ID:", row.session_id);
  try {
    const data = JSON.parse(row.data);
    console.log("Role:", data.role);
    console.log("Model ID:", data.modelID);
    console.log("Text:", data.text ? data.text.slice(0, 200) : '');
  } catch (e) {
    console.log("Raw:", row.data.slice(0, 200));
  }
}

console.log("\nSearching part table...");
const query2 = db.prepare("SELECT id, session_id, message_id, data FROM part WHERE data LIKE '%claim_template%' OR data LIKE '%template%'");
const rows2 = query2.all();
for (const row of rows2) {
  console.log("==========================================");
  console.log("Part ID:", row.id, "Session ID:", row.session_id, "Message ID:", row.message_id);
  try {
    const data = JSON.parse(row.data);
    if (data.type === 'tool') {
      console.log("Tool Name:", data.tool);
      console.log("Tool Input:", JSON.stringify(data.state?.input, null, 2));
      console.log("Tool Output:", data.state?.output ? data.state.output.slice(0, 200) : '');
    } else {
      console.log("Type:", data.type, "Text:", data.text ? data.text.slice(0, 200) : '');
    }
  } catch (e) {
    console.log("Raw:", row.data.slice(0, 200));
  }
}
