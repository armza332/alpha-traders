/* =====================================================================
   agent-data.js — Agent roster + role/status config (MOCK DATA)
   ---------------------------------------------------------------------
   วิธีต่อข้อมูลจริง: แทนที่ window.AGENTS ด้วย JSON ของคุณ
   โครงสร้างที่ต้องมีต่อ 1 agent:
     {
       id:      string  (unique)
       name:    string
       role:    "researcher" | "coder" | "writer" | "analyst" | "designer" | "ops"
       status:  "working" | "idle" | "waiting" | "error"
       task:    string   (งานที่กำลังทำ — โชว์ใน popup + bubble)
       progress:number   (0-100, optional)
       tasksToday: number (optional)
     }
   ===================================================================== */

// ---- ROLES : สี shirt + ป้ายบทบาท -----------------------------------
window.ROLES = {
  researcher: { label: "Researcher", th: "นักวิจัย",   shirt: "#a96bff", hair: "#2b2342", icon: "search" },
  coder:      { label: "Coder",      th: "โปรแกรมเมอร์", shirt: "#2de2e6", hair: "#13313a", icon: "code"   },
  writer:     { label: "Writer",     th: "นักเขียน",    shirt: "#ff5cce", hair: "#3a1430", icon: "pen"    },
  analyst:    { label: "Analyst",    th: "นักวิเคราะห์", shirt: "#4d7cff", hair: "#16224a", icon: "chart"  },
  designer:   { label: "Designer",   th: "ดีไซเนอร์",   shirt: "#3df58a", hair: "#0f3a28", icon: "brush"  },
  ops:        { label: "Ops",        th: "ระบบ",        shirt: "#ffc44d", hair: "#3a2c10", icon: "gear"   },
};

// ---- STATUS : สี + โซน + ไอคอนลอยหัว ---------------------------------
window.STATUS = {
  working: { label: "ทำงาน", en: "WORKING", color: "#2de2e6", zone: "desk",  icon: "gear",  glow: true  },
  idle:    { label: "ว่าง",  en: "IDLE",    color: "#3df58a", zone: "sofa",  icon: "zzz",   glow: false },
  waiting: { label: "รอคิว", en: "WAITING", color: "#ffc44d", zone: "wait",  icon: "hour",  glow: false },
  error:   { label: "Error", en: "ERROR",   color: "#ff4d6d", zone: "desk",  icon: "bang",  glow: true  },
};

// skin tones for variety
const SKINS = ["#f1c9a5", "#e0a878", "#c98a5e", "#a8693f", "#8a5a3a", "#f5d6b8"];

// ---- 15 AGENTS -------------------------------------------------------
window.AGENTS = [
  { id:"a01", name:"ATHENA", role:"researcher", status:"working", task:"สรุปงานวิจัย LLM ปี 2025",            progress:64, tasksToday:7 },
  { id:"a02", name:"BYTE",   role:"coder",      status:"working", task:"รีแฟกเตอร์ auth service",              progress:42, tasksToday:12 },
  { id:"a03", name:"CIPHER", role:"coder",      status:"error",   task:"build pipeline ล้มเหลว · exit 1",      progress:0,  tasksToday:9 },
  { id:"a04", name:"QUILL",  role:"writer",     status:"working", task:"ร่างบล็อกโพสต์เปิดตัวฟีเจอร์",          progress:80, tasksToday:5 },
  { id:"a05", name:"VEGA",   role:"analyst",    status:"working", task:"วิเคราะห์ funnel คอนเวอร์ชัน Q2",       progress:55, tasksToday:6 },
  { id:"a06", name:"NOVA",   role:"designer",   status:"idle",    task:"พักหลังส่งงาน mockup",                  progress:100,tasksToday:4 },
  { id:"a07", name:"ORION",  role:"ops",        status:"working", task:"มอนิเตอร์ cluster k8s-prod",            progress:33, tasksToday:18 },
  { id:"a08", name:"SAGE",   role:"researcher", status:"waiting", task:"รอผลอนุมัติ dataset",                  progress:20, tasksToday:3 },
  { id:"a09", name:"TURING", role:"coder",      status:"idle",    task:"ว่าง · รอ assign งานถัดไป",            progress:100,tasksToday:11 },
  { id:"a10", name:"LUMEN",  role:"designer",   status:"working", task:"ทำ icon set สำหรับ dashboard",          progress:71, tasksToday:8 },
  { id:"a11", name:"MOCHA",  role:"writer",     status:"waiting", task:"รอ feedback จากรีวิวเวอร์",            progress:90, tasksToday:2 },
  { id:"a12", name:"ZEPHYR", role:"analyst",    status:"working", task:"สร้างรายงานยอดขายรายสัปดาห์",          progress:48, tasksToday:6 },
  { id:"a13", name:"ECHO",   role:"ops",        status:"idle",    task:"ว่าง · standby on-call",               progress:100,tasksToday:15 },
  { id:"a14", name:"PIXEL",  role:"designer",   status:"working", task:"ออกแบบหน้า onboarding ใหม่",            progress:27, tasksToday:5 },
  { id:"a15", name:"DELTA",  role:"researcher", status:"working", task:"เก็บข้อมูล benchmark โมเดล",            progress:60, tasksToday:9 },
];

// assign a stable skin per agent
window.AGENTS.forEach((a, i) => { a.skin = SKINS[i % SKINS.length]; });
