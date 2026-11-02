function safeFileName(value) {
  return String(value || "论文").replace(/[\\/:*?"<>|]/g, "_").slice(0,80);
}
module.exports={safeFileName};
