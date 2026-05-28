/* ═══════════════════════════════════════════════════════
   I18N — Thai / English toggle
     - ใช้ data-i18n attribute สำหรับ static text
     - ฟังก์ชัน t(key) สำหรับ dynamic text ใน JS
     - บันทึก preference ใน localStorage
   ═══════════════════════════════════════════════════════ */
const I18n = {
  KEY: 'twr_lang',
  current: 'th',

  init() {
    this.current = localStorage.getItem(this.KEY) || 'th';
    this.applyToDOM();
  },

  set(lang) {
    if (lang !== 'th' && lang !== 'en') return;
    this.current = lang;
    localStorage.setItem(this.KEY, lang);
    this.applyToDOM();
    // Re-render dynamic UI
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) {
      TradingWarRoom.fullUpdate();
    }
  },

  toggle() {
    this.set(this.current === 'th' ? 'en' : 'th');
  },

  t(key, fallback) {
    return this.dict[this.current]?.[key] ?? this.dict.th[key] ?? (fallback ?? key);
  },

  applyToDOM() {
    // Update [data-i18n] elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const translated = this.t(key);
      if (translated) el.textContent = translated;
    });
    // Update [data-i18n-title] for tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const translated = this.t(key);
      if (translated) el.title = translated;
    });
    // Update lang button label
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = this.current === 'th' ? '🇹🇭 TH' : '🇺🇸 EN';
    document.documentElement.lang = this.current;
  },

  dict: {
    th: {
      // Header
      'btn.help':       '❓ HELP',
      'btn.settings':   '⚙ SETTINGS',
      'btn.journal':    '📓 JOURNAL',
      'btn.backtest':   '🔬 BACKTEST',

      // Status
      'status.live':    'LIVE',
      'status.init':    'INIT',
      'status.loading': 'กำลังโหลด...',

      // Team panels
      'team.gold':           '🥇 GOLD TEAM',
      'team.currency':       '💱 CURRENCY TEAM',
      'team.gold.desc':      'XAU/USD — โต๊ะโลหะมีค่า',
      'team.currency.desc':  'AUD/USD + EUR/USD — โต๊ะ FX',
      'team.commander':      '👑 COMMANDER — Central Control',
      'team.commander.desc': 'รวมสัญญาณทุกทีม → คำสั่งสุดท้าย',
      'team.log':            '📡 AGENT COMMS',
      'team.log.desc':       'real-time activity ของ agent',

      // Settings labels
      'set.title':       '⚙ SETTINGS — Telegram & Alerts',
      'set.botToken':    '🤖 Bot Token',
      'set.botHint':     '(จาก @BotFather)',
      'set.chatId':      '💬 Chat ID',
      'set.minGrade':    '⭐ ส่งเฉพาะ Grade ขั้นต่ำ',
      'set.cooldown':    '⏱ Cooldown (นาที)',
      'set.tgOn':        'เปิด Telegram notifications',
      'set.sound':       'เปิดเสียง alert',
      'set.tradeMode':   '🎯 Trade Mode',
      'set.tradeHint':   '(ปรับ TP/SL ตามสไตล์)',
      'set.symFilter':   '🎯 Symbol Filter',
      'set.adxGate':     '📈 ADX Gate',
      'set.adxHint':     '(0=ปิด, แนะนำ 20 — ตลาด trend เท่านั้น)',
      'set.analysts':    '👥 Active Analysts',
      'set.priceFeed':   '💹 PRICE FEED (ราคาจริง)',
      'set.apiKey':      '🔑 Twelve Data API Key',
      'set.feedOn':      'เปิดดึงราคาจริง',
      'set.refresh':     '⏱ Refresh (วินาที, ≥60)',
      'set.keepAlive':   '🔋 Keep-Alive (ป้องกัน tab sleep)',

      // Buttons
      'btn.test':         '🧪 ทดสอบส่ง',
      'btn.testPrice':    '🧪 ทดสอบดึงราคา',
      'btn.sendNews':     '📰 ส่งข่าววันนี้',
      'btn.save':         '💾 บันทึก',
      'btn.run':          '▶ Run',
      'btn.autoOpt':      '🚀 Start Auto-Opt',
      'btn.stop':         '⏹ Stop',
      'btn.export':       '📤 Export JSON',
      'btn.import':       '📥 Import & Merge',
      'btn.reset':        '🔄 Reset',
      'btn.exportCSV':    '📥 Export CSV',
      'btn.clearAll':     '🗑 Clear All',
      'btn.requestNotif': '🔔 ขอ Notif Permission',

      // Backtest
      'bt.title':       '🔬 BACKTEST — ทดสอบ Strategy บน History',
      'bt.config':      '🔬 BACKTEST CONFIG',
      'bt.symbol':      'Symbol',
      'bt.mode':        'Mode',
      'bt.tf':          'Timeframe',
      'bt.minConf':     'Min Conf',
      'bt.autoOptDesc': '🤖 AUTO-OPTIMIZE — ทดสอบหลาย combinations + พัฒนาตัวเอง',

      // Journal
      'jrn.title':     '📓 TRADE JOURNAL — ประวัติสัญญาณ + ผลลัพธ์',
      'jrn.total':     'Total Signals',
      'jrn.wins':      'Wins',
      'jrn.losses':    'Losses',
      'jrn.breakeven': 'Breakeven',
      'jrn.winrate':   'Win Rate',
      'jrn.pnl':       'Total P/L',
    },

    en: {
      // Header
      'btn.help':       '❓ HELP',
      'btn.settings':   '⚙ SETTINGS',
      'btn.journal':    '📓 JOURNAL',
      'btn.backtest':   '🔬 BACKTEST',

      // Status
      'status.live':    'LIVE',
      'status.init':    'INIT',
      'status.loading': 'Loading...',

      // Team panels
      'team.gold':           '🥇 GOLD TEAM',
      'team.currency':       '💱 CURRENCY TEAM',
      'team.gold.desc':      'XAU/USD — Precious Metals Desk',
      'team.currency.desc':  'AUD/USD + EUR/USD — FX Desk',
      'team.commander':      '👑 COMMANDER — Central Control',
      'team.commander.desc': 'Aggregates team signals → Final order',
      'team.log':            '📡 AGENT COMMS',
      'team.log.desc':       'Real-time agent activity feed',

      // Settings labels
      'set.title':       '⚙ SETTINGS — Telegram & Alerts',
      'set.botToken':    '🤖 Bot Token',
      'set.botHint':     '(from @BotFather)',
      'set.chatId':      '💬 Chat ID',
      'set.minGrade':    '⭐ Send signals at Grade',
      'set.cooldown':    '⏱ Cooldown (minutes)',
      'set.tgOn':        'Enable Telegram notifications',
      'set.sound':       'Enable alert sound',
      'set.tradeMode':   '🎯 Trade Mode',
      'set.tradeHint':   '(adjusts TP/SL per style)',
      'set.symFilter':   '🎯 Symbol Filter',
      'set.adxGate':     '📈 ADX Gate',
      'set.adxHint':     '(0=off, 20=recommended — trending only)',
      'set.analysts':    '👥 Active Analysts',
      'set.priceFeed':   '💹 PRICE FEED (live market)',
      'set.apiKey':      '🔑 Twelve Data API Key',
      'set.feedOn':      'Enable live prices',
      'set.refresh':     '⏱ Refresh (sec, ≥60)',
      'set.keepAlive':   '🔋 Keep-Alive (prevent tab sleep)',

      // Buttons
      'btn.test':         '🧪 Test Send',
      'btn.testPrice':    '🧪 Test Fetch Price',
      'btn.sendNews':     '📰 Send Today News',
      'btn.save':         '💾 Save',
      'btn.run':          '▶ Run',
      'btn.autoOpt':      '🚀 Start Auto-Opt',
      'btn.stop':         '⏹ Stop',
      'btn.export':       '📤 Export JSON',
      'btn.import':       '📥 Import & Merge',
      'btn.reset':        '🔄 Reset',
      'btn.exportCSV':    '📥 Export CSV',
      'btn.clearAll':     '🗑 Clear All',
      'btn.requestNotif': '🔔 Request Notif Permission',

      // Backtest
      'bt.title':       '🔬 BACKTEST — Strategy on History',
      'bt.config':      '🔬 BACKTEST CONFIG',
      'bt.symbol':      'Symbol',
      'bt.mode':        'Mode',
      'bt.tf':          'Timeframe',
      'bt.minConf':     'Min Conf',
      'bt.autoOptDesc': '🤖 AUTO-OPTIMIZE — Test many combinations + self-improve',

      // Journal
      'jrn.title':     '📓 TRADE JOURNAL — Signal History + Outcomes',
      'jrn.total':     'Total Signals',
      'jrn.wins':      'Wins',
      'jrn.losses':    'Losses',
      'jrn.breakeven': 'Breakeven',
      'jrn.winrate':   'Win Rate',
      'jrn.pnl':       'Total P/L',
    },
  },
};

window.I18n = I18n;
window.t = (key, fb) => I18n.t(key, fb);
