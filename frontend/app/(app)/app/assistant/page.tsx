"use client";
import { useApp } from "@/components/app/AppProvider";
import AgentTape from "@/components/AgentTape";
import Chat from "@/components/Chat";

export default function AssistantPage() {
  const { user, chat } = useApp();
  return (
    <>
      <title>Assistant · FinMate AI</title>
      <div className="assistant">
        <section aria-label="Chat">
          <Chat messages={chat.messages} busy={chat.busy} userName={user.name}
            onSend={chat.send}
            onConfirm={chat.confirm} onConfirmBill={chat.confirmBill} onDiscard={chat.discard} />
        </section>
        <section aria-label="Agent activity" className="tape-col">
          <AgentTape trace={chat.trace} busy={chat.busy} />
        </section>
      </div>
    </>
  );
}
