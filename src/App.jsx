/**
 * ChatB2K™ Sovereign Agentic Swarm OS (chatb2k101 - chatb2k173)
 * Target Environment: Vercel Edge / Supabase Production Core (dashboard.resofit.fit)
 * Architecture: Extreme Privacy Vault, Social OAuth Integration (Meta/TikTok/VPN),
 * Daily Habit/Mood/Desire Tensor, and Agentic Swarm Fund Multiplier.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Zap, Cpu, Activity, Globe, DollarSign, Heart, Compass, Sparkles, Terminal } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('SWARM');
  const [agentSwarmLog, setAgentSwarmLog] = useState([
    { agent: 'chatb2k101', action: 'Vectorizing daily mood & craving telemetry...', status: 'SECURE' },
    { agent: 'chatb2k125', action: 'Optimizing crowd-courier delivery nodes for Lagos & Diaspora...', status: 'ACTIVE' },
    { agent: 'chatb2k173', action: 'Reinvesting sovereign crypto liquidity into inventory matrix...', status: 'MULTIPLYING' }
  ]);

  const [memberState, setMemberState] = useState({
    alias: 'Sovereign Coach Buchi',
    tier: 'LuxeGold',
    xp: 4820,
    mood: 'Peak Sovereign Focus',
    cravingIndex: 'Low (Optimized via Guinean Seed Protocol)',
    cryptoVaultBalance: '$14,250.00 USDC',
    privacyLevel: 'Zero-Knowledge Encrypted'
  });

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'ChatB2K Agent (chatb2k101)', text: 'Sovereign matrix synchronized. Extreme privacy vault active. What economic pull or physical habit shall we optimize today?' }
  ]);

  const chatScrollRef = useRef(null);

  // Simulated Agentic Swarm Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      const swarmId = Math.floor(Math.random() * 73) + 101;
      const actions = [
        'Analyzing TikTok behavioral sentiment feed...',
        'Securing VPN encrypted session node...',
        'Orchestrating white-glove bundle delivery...',
        'Executing automated crypto liquidity rebalance...'
      ];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      setAgentSwarmLog(prev => [
        { agent: `chatb2k${swarmId}`, action: randomAction, status: 'OPTIMIZED' },
        ...prev.slice(0, 5)
      ]);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setMessages(prev => [...prev, { sender: 'You', text: userText }]);
    setChatInput('');

    setTimeout(() => {
      setMessages(prev => [
        ...prev, 
        { 
          sender: 'ChatB2K Sovereign Intelligence', 
          text: `[Encrypted Tensor Response]: Processed your request regarding "${userText}". Agent swarm chatb2k101-173 has mapped your desire, locked privacy, and pre-staged the omni-solution for instant delivery.` 
        }
      ]);
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA] font-sans selection:bg-[#D4AF37] selection:text-black pb-12">
      {/* Ambient Glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[160px] pointer-events-none opacity-20 bg-gradient-to-tr from-[#D4AF37] to-emerald-500"></div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-[#D4AF37]/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-amber-200 p-[1px] shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center">
            <div className="h-full w-full rounded-xl bg-black flex items-center justify-center font-black text-xs text-[#D4AF37]">
              999
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-black tracking-widest text-white uppercase">ChatB2K™ Swarm OS</h1>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">SECURE E2E</span>
            </div>
            <p className="text-[9px] text-zinc-400 font-mono">dashboard.resofit.fit • Ecosystem Valuation ₦48.2B</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-xl text-right">
            <p className="text-[9px] font-mono text-zinc-400">Vault Balance</p>
            <p className="text-xs font-mono font-bold text-[#D4AF37]">{memberState.cryptoVaultBalance}</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4 relative z-10">
        
        {/* Navigation Tabs */}
        <div className="flex bg-zinc-900/80 border border-zinc-800 p-1 rounded-2xl">
          <button onClick={() => setActiveTab('SWARM')} className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'SWARM' ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20' : 'text-zinc-400 hover:text-white'}`}>
            SWARM ENGINE
          </button>
          <button onClick={() => setActiveTab('VAULT')} className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'VAULT' ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20' : 'text-zinc-400 hover:text-white'}`}>
            PRIVACY & HABITS
          </button>
          <button onClick={() => setActiveTab('CRYPTO')} className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${activeTab === 'CRYPTO' ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20' : 'text-zinc-400 hover:text-white'}`}>
            CRYPTO & REVENUE
          </button>
        </div>

        {/* TAB 1: SWARM ENGINE */}
        {activeTab === 'SWARM' && (
          <div className="space-y-4">
            <!-- Agent Swarm Activity Monitor -->
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-mono text-[#D4AF37] flex items-center gap-2">
                  <Cpu className="w-4 h-4 animate-pulse" />
                  AGENTIC SWARM (chatb2k101 — chatb2k173)
                </span>
                <span className="text-[10px] font-mono text-emerald-400">73 Nodes Active</span>
              </div>
              
              <div className="space-y-2 font-mono text-[11px]">
                {agentSwarmLog.map((log, index) => (
                  <div key={index} className="flex items-center justify-between bg-black/40 p-2 rounded-xl border border-zinc-900">
                    <span className="text-[#D4AF37] font-bold">{log.agent}</span>
                    <span className="text-zinc-300 truncate max-w-[200px]">{log.action}</span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">{log.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <!-- ChatB2K Sovereign Intelligence Interface -->
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#D4AF37]" />
                  LORD OF LIGHT SOVEREIGN COMMAND
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Zero-Knowledge Mode</span>
              </div>

              <div ref={chatScrollRef} className="h-56 overflow-y-auto space-y-2.5 text-xs pr-1">
                {messages.map((m, i) => (
                  <div key={i} className={`p-3 rounded-2xl max-w-[90%] space-y-1 ${m.sender === 'You' ? 'ml-auto bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-white' : 'bg-black/60 border border-zinc-800 text-zinc-200'}`}>
                    <p className="text-[9px] font-mono text-[#D4AF37] uppercase">{m.sender}</p>
                    <p className="leading-relaxed">{m.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2 pt-1">
                <input 
                  type="text" 
                  value={chatInput} 
                  onChange={(e) => setChatInput(e.target.value)} 
                  placeholder="Ask ChatB2K to orchestrate habits, meals, crypto, or desires..." 
                  className="flex-1 bg-black/80 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#D4AF37] focus:outline-none"
                />
                <button type="submit" className="bg-[#D4AF37] text-black font-extrabold text-xs px-4 py-2.5 rounded-xl hover:opacity-95 transition-opacity cursor-pointer">
                  Transmit
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: PRIVACY & HABITS */}
        {activeTab === 'VAULT' && (
          <div className="space-y-4">
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Extreme Privacy & Habit Vault
                </h3>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">ENCRYPTED</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-black/50 p-3 rounded-xl border border-zinc-900 space-y-1">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Current Mood Tensor</p>
                  <p className="font-bold text-white">{memberState.mood}</p>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-zinc-900 space-y-1">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Craving & Stress Index</p>
                  <p className="font-bold text-[#D4AF37]">{memberState.cravingIndex}</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-mono text-zinc-400">Social Auth & VPN Integration Bridges:</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl font-bold text-white">Meta Connect</div>
                  <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl font-bold text-white">TikTok Sync</div>
                  <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl font-bold text-emerald-400">VPN Shield</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CRYPTO & REVENUE */}
        {activeTab === 'CRYPTO' && (
          <div className="space-y-4">
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Crypto Ingest & Reinvestment Engine
                </h3>
                <span className="text-[10px] font-mono text-emerald-400">Autonomous Reinvest</span>
              </div>

              <div className="p-4 bg-black/60 rounded-xl border border-zinc-800 space-y-2">
                <p className="text-[10px] font-mono text-zinc-400 uppercase">Total Ecosystem Liquidity Managed</p>
                <p className="text-xl font-mono font-black text-white">₦48,200,000,000 <span className="text-xs text-[#D4AF37] font-normal">Target Horizon</span></p>
                <p className="text-xs text-zinc-300">Agentic swarm chatb2k101-173 automatically routes, pools, and multiplies inflows across digital skill products, ResoFlex hardware, and global whiteglove fulfillment nodes.</p>
              </div>

              <button onClick={() => alert("Crypto Liquidity Rebalance Triggered across Vercel & Supabase Edge Nodes!")} className="w-full py-3 bg-gradient-to-r from-[#D4AF37] via-amber-400 to-amber-500 text-black font-black text-xs rounded-xl shadow-lg shadow-[#D4AF37]/20 hover:opacity-95 transition-all cursor-pointer">
                Execute Autonomous Reinvestment Cycle
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
