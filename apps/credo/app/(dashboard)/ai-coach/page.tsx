import { useSession } from "next-auth/react";

/* ... (Types and Suggested Questions unchanged) ... */

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "12px 16px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: "#94A3B8",
          animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }}/>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const { data: session } = useSession();
  const initials = session?.user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "C";

  const formatContent = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        const bold = line.replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong>${m}</strong>`);
        return <p key={i} style={{ margin: "0 0 6px", lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: bold }}/>;
      });
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      gap: 10,
      alignItems: "flex-end",
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #0B1D35, #1E4470)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 4,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="6" width="11" height="7.5" rx="2" stroke="#C4953A" strokeWidth="1.3"/>
            <path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#C4953A" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="5.5" cy="9.5" r="1" fill="white"/>
            <circle cx="10.5" cy="9.5" r="1" fill="white"/>
          </svg>
        </div>
      )}

      <div style={{
        maxWidth: "72%",
        padding: "12px 16px",
        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isUser ? "#0B1D35" : "#FFFFFF",
        border: isUser ? "none" : "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: "0.875rem", color: isUser ? "#FFFFFF" : "#0F172A" }}>
          {formatContent(message.content)}
        </div>
        <p style={{
          fontSize: "0.6875rem",
          color: isUser ? "rgba(255,255,255,0.5)" : "#94A3B8",
          margin: "6px 0 0",
          textAlign: isUser ? "right" : "left",
        }}>
          {message.timestamp.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #0B1D35, #1E4470)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 4,
          fontSize: "0.6875rem", fontWeight: 700, color: "#C4953A",
        }}>
          {initials}
        </div>
      )}
    </div>
  );
}

export default function AICoachPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: `Hello! I am your Credo AI Credit Coach.

I understand South African credit law — the **National Credit Act**, POPIA, debt review, prescription rules, emolument attachment orders, and your rights with all four credit bureaus.

I can see your credit profile and help you understand exactly what is affecting your score and what actions to take.

**What would you like to know today?**`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [language, setLanguage] = useState("English");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content) return;

    const userMsg: Message = { id: Date.now(), role: "user", content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: content, 
          language,
          consumerId: session?.user?.id
        }),
      });
      const data = await res.json();
      const responseText = res.ok
        ? (data.reply ?? 'Sorry, I could not generate a response.')
        : (data.error ?? 'AI service is temporarily unavailable. Please try again.');

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: 'Connection error. Please check your internet and try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ height: "calc(100vh - 64px - 56px)", display: "flex", flexDirection: "column", gap: 0, maxWidth: 900 }}>

      {/* Header */}
      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "12px 12px 0 0",
        padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, #0B1D35, #1E4470)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="9" rx="2" stroke="#C4953A" strokeWidth="1.5"/>
              <path d="M7 8V6a3 3 0 016 0v2" stroke="#C4953A" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="7" cy="12.5" r="1.5" fill="white"/>
              <circle cx="13" cy="12.5" r="1.5" fill="white"/>
            </svg>
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: "#059669", border: "2px solid white" }}/>
          </div>
          <div>
            <p style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>Credo AI Credit Coach</p>
            <p style={{ fontSize: "0.8125rem", color: "#059669", margin: 0, fontWeight: 500 }}>Online &bull; Knows your credit profile</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{
              padding: "6px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: "0.8125rem",
              color: "#475569",
              background: "#F8F9FA",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {["Afrikaans", "English", "isiNdebele", "isiXhosa", "isiZulu", "Sepedi", "Sesotho", "Setswana", "siSwati", "Tshivenda", "Xitsonga"].map(l => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button style={{
            padding: "6px 12px", border: "1px solid #E2E8F0", borderRadius: 8,
            fontSize: "0.8125rem", color: "#475569", background: "#F8F9FA", cursor: "pointer",
          }}>
            Clear chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        background: "#F8F9FA",
        borderLeft: "1px solid #E2E8F0",
        borderRight: "1px solid #E2E8F0",
        padding: "20px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {typing && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #0B1D35, #1E4470)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="5" width="10" height="7" rx="1.5" stroke="#C4953A" strokeWidth="1.2"/>
                <path d="M4.5 5V4a2.5 2.5 0 015 0v1" stroke="#C4953A" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px 16px 16px 4px", padding: "4px 4px" }}>
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div style={{
          background: "#FFFFFF",
          borderLeft: "1px solid #E2E8F0",
          borderRight: "1px solid #E2E8F0",
          padding: "12px 16px",
          display: "flex", gap: 8, overflowX: "auto",
          borderTop: "1px solid #F1F5F9",
        }}>
          {SUGGESTED_QUESTIONS.slice(0, 4).map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                padding: "7px 12px",
                background: "#F8F9FA",
                border: "1px solid #E2E8F0",
                borderRadius: 9999,
                fontSize: "0.8125rem",
                color: "#374151",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
                transition: "all 150ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0B1D35"; (e.currentTarget as HTMLElement).style.color = "#0B1D35"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "0 0 12px 12px",
        padding: "12px 16px",
        display: "flex", alignItems: "flex-end", gap: 10,
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about your credit, SA law, disputes, debt review..."
            rows={1}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1.5px solid #E2E8F0",
              borderRadius: 9,
              fontSize: "0.875rem",
              color: "#0F172A",
              resize: "none",
              outline: "none",
              fontFamily: "var(--font-inter), sans-serif",
              lineHeight: 1.5,
              transition: "border-color 150ms",
              boxSizing: "border-box",
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = "#0B1D35"; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = "#E2E8F0"; }}
          />
        </div>
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || typing}
          style={{
            width: 40, height: 40, borderRadius: 9,
            background: input.trim() && !typing ? "#0B1D35" : "#E2E8F0",
            border: "none", cursor: input.trim() && !typing ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background-color 150ms", flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill={input.trim() && !typing ? "#FFFFFF" : "#94A3B8"}/>
          </svg>
        </button>
      </div>

      <p style={{ fontSize: "0.75rem", color: "#94A3B8", textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
        Credo AI provides general guidance under SA law. For legal advice, consult a qualified attorney or the Credit Ombud (free).
      </p>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
