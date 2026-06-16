const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/home/acer/.openwork/openwork-orchestrator/openwork-dev-data/xdg/data/opencode/opencode.db');
const query = db.prepare("SELECT id, message_id, data FROM part WHERE session_id = 'ses_131bf6457ffeahI34Cu49tx6sT' ORDER BY time_created DESC LIMIT 10");
const rows = query.all();
for (const row of rows) {
  try {
    const data = JSON.parse(row.data);
    console.log("==========================================");
    console.log("Part ID:", row.id, "Message ID:", row.message_id);
    if (data.type === 'tool') {
      console.log("Tool Call:", JSON.stringify(data, null, 2));
    } else {
      console.log("Type:", data.type, "Text:", data.text);
    }
  } catch (e) {
    console.log("Raw:", row.data);
  }
}
