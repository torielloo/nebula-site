import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import ProfileAvatar from "@/components/ProfileAvatar";
import UserQuickCard from "@/components/users/UserQuickCard";
import MentionMenu from "@/components/users/MentionMenu";
import MentionText from "@/components/users/MentionText";
import useMentionComposer from "@/hooks/useMentionComposer";
import MessageReactions from "@/components/chat/MessageReactions";
import StickerPicker from "@/components/chat/StickerPicker";
import AttachmentPicker from "@/components/tickets/AttachmentPicker";
import MessageAttachments from "@/components/tickets/MessageAttachments";
import VoiceRecorderButton from "@/components/chat/VoiceRecorderButton";
import { useCall } from "@/lib/CallContext";
import { useCallPresence } from "@/lib/callPresence";
import PrivateCallPanel from "@/components/calls/PrivateCallPanel";
import { ArrowLeft, Phone, PhoneIncoming, Send, Cpu, Reply, Pencil, Trash2, X, Check, Loader2, Volume2, VolumeX, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalTime } from "@/lib/time";
import { useI18n } from "@/lib/i18n";
import { getCoreOsVoiceConfig, playCoreOsVoice, stopCoreOsVoice, unlockAiVoice } from "@/lib/coreOsVoice";
import { prepareCoreAiPlan } from "@/lib/coreAiRuntime";
import { useIsMobile } from "@/hooks/use-mobile";

const dmAttachmentUrlCache = new Map();
const DM_ATTACHMENT_CACHE_MS = 13 * 60 * 1000;
const isPublicAttachmentUrl = (url) => /^https?:\/\//i.test(String(url || ""));

function mergeMessageRows(current = [], incoming = []) {
  const map = new Map();
  [...current, ...incoming].forEach((row) => {
    if (!row?.id) return;
    const previous = map.get(row.id);
    map.set(row.id, previous ? { ...previous, ...row } : row);
  });
  return [...map.values()].sort((a, b) => {
    const at = new Date(a.created_date || 0).getTime();
    const bt = new Date(b.created_date || 0).getTime();
    if (at !== bt) return at - bt;
    return String(a.id).localeCompare(String(b.id));
  });
}

export default function ChatWindow({ conversation, me, canUseCore = false, onBack }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState(null);
  const [reactions, setReactions] = useState({});
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [sendError, setSendError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(null);
  const [callStarting, setCallStarting] = useState(false);
  const [coreVoiceConfig, setCoreVoiceConfig] = useState(null);
  const [coreModel, setCoreModel] = useState("");
  const [coreModelFallback, setCoreModelFallback] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState(() => {
    const cached = dmAttachmentUrlCache.get(conversation.id);
    return cached && cached.expiresAt > Date.now() ? cached.urls : {};
  });
  const [batchAttachmentSigningFailed, setBatchAttachmentSigningFailed] = useState(false);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const { channel, setChannel, sharing, peers } = useCall();
  const partner = (conversation.participant_meta || []).find((p) => p.id !== me.id) || { name: t("common.user") };
  const partnerId = partner.id || (conversation.participants || []).find((id) => id && id !== me.id && id !== "core-os") || "";
  const [callMuteVersion, setCallMuteVersion] = useState(0);
  const [muteManagerOpen, setMuteManagerOpen] = useState(false);
  const [mobileCallExpanded, setMobileCallExpanded] = useState(false);
  const callMuteEntry = (() => {
    try {
      const all = JSON.parse(localStorage.getItem("nebula:private-call-mutes") || "{}");
      const entry = all?.[partnerId];
      const until = typeof entry === "number" ? entry : Number(entry?.until || 0);
      return until > Date.now() ? { until, name: entry?.name || partner.name } : null;
    } catch { return null; }
  })();
  const clearPartnerCallMute = () => {
    try {
      const all = JSON.parse(localStorage.getItem("nebula:private-call-mutes") || "{}");
      delete all[partnerId];
      localStorage.setItem("nebula:private-call-mutes", JSON.stringify(all));
      setCallMuteVersion((value) => value + 1);
    } catch {}
  };
  const activeCallMutes = (() => {
    try {
      const all = JSON.parse(localStorage.getItem("nebula:private-call-mutes") || "{}");
      return Object.entries(all).filter(([, entry]) => {
        const until = typeof entry === "number" ? entry : Number(entry?.until || 0);
        return until > Date.now();
      });
    } catch { return []; }
  })();
  const removeCallMute = (userId) => {
    try {
      const all = JSON.parse(localStorage.getItem("nebula:private-call-mutes") || "{}");
      delete all[userId];
      localStorage.setItem("nebula:private-call-mutes", JSON.stringify(all));
      setCallMuteVersion((value) => value + 1);
    } catch {}
  };
  const anyScreenSharing = sharing || (peers || []).some((peer) => peer.sharing);
  const participants = (conversation.participant_meta || []).filter((p) => p.id !== me.id);
  const isCoreOS = (conversation.participants || []).includes("core-os");
  const coreMode = String(partner.name || "").toLowerCase().includes("owner") ? "owner" : "staff";
  const callChannel = { name: partner.name, code: `DM-${conversation.id}`, privateDm: true, conversationId: conversation.id, peerUserId: partnerId };
  const inThisCall = !!(channel && channel.code === callChannel.code);
  const callRoster = useCallPresence(callChannel.code);
  const partnerInCall = !inThisCall && callRoster.length > 0;
  const mention = useMentionComposer({ value: draft, onChange: setDraft, scopeUsers: participants, limit: 5 });

  useEffect(() => {
    if (!isMobile) {
      setMobileCallExpanded(false);
      return;
    }
    setMobileCallExpanded(inThisCall);
  }, [isMobile, inThisCall, conversation.id]);

  useEffect(() => {
    const reopen = () => {
      if (isMobile && inThisCall) setMobileCallExpanded(true);
    };
    window.addEventListener("nebula:open-private-call", reopen);
    return () => window.removeEventListener("nebula:open-private-call", reopen);
  }, [isMobile, inThisCall]);

  useEffect(() => {
    let active = true;
    let syncing = false;
    setMessages(null);
    setReactions({});
    const cachedMedia = dmAttachmentUrlCache.get(conversation.id);
    setSignedAttachmentUrls(cachedMedia && cachedMedia.expiresAt > Date.now() ? cachedMedia.urls : {});
    setBatchAttachmentSigningFailed(false);
    nearBottomRef.current = true;
    initialScrollDoneRef.current = false;

    const syncMessages = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const list = await base44.entities.DirectMessage.filter(
          { conversation_id: conversation.id },
          "-created_date",
          200
        );
        if (active) setMessages((prev) => mergeMessageRows(prev || [], list));
      } catch {
        if (active) setMessages((prev) => prev === null ? [] : prev);
      } finally {
        syncing = false;
      }
    };

    syncMessages();
    base44.entities.MessageReaction
      .filter({ conversation_id: conversation.id }, "created_date", 500)
      .then((list) => {
        if (!active) return;
        const map = {};
        list.forEach((r) => {
          (map[r.message_id] = map[r.message_id] || []).push(r);
        });
        setReactions(map);
      });

    const unsubMessages = base44.entities.DirectMessage.subscribe((event) => {
      if (!event.data || event.data.conversation_id !== conversation.id) return;
      setMessages((prev) => {
        const current = prev || [];
        if (event.type === "delete") return current.filter((m) => m.id !== event.data.id);
        if (event.type === "create" || event.type === "update") return mergeMessageRows(current, [event.data]);
        return current;
      });
    });
    const unsubReactions = base44.entities.MessageReaction.subscribe((event) => {
      if (!event.data || event.data.conversation_id !== conversation.id) return;
      setReactions((prev) => {
        const map = { ...prev };
        const forMsg = (map[event.data.message_id] || []).filter((r) => r.id !== event.data.id);
        if (event.type === "create") forMsg.push(event.data);
        if (forMsg.length) map[event.data.message_id] = forMsg;
        else delete map[event.data.message_id];
        return map;
      });
    });

    // O realtime é a via principal; esta reconciliação curta impede que uma
    // conexão websocket interrompida deixe o chat congelado ou perca mensagens.
    const syncTimer = window.setInterval(syncMessages, 2500);
    const syncOnFocus = () => syncMessages();
    window.addEventListener("focus", syncOnFocus);
    document.addEventListener("visibilitychange", syncOnFocus);

    return () => {
      active = false;
      window.clearInterval(syncTimer);
      window.removeEventListener("focus", syncOnFocus);
      document.removeEventListener("visibilitychange", syncOnFocus);
      unsubMessages();
      unsubReactions();
    };
  }, [conversation.id]);

  useEffect(() => {
    if (!Array.isArray(messages) || !messages.length) return undefined;
    const typeByUri = new Map();
    const privateUris = [];
    for (const message of messages) {
      for (const attachment of message?.attachments || []) {
        const uri = String(attachment?.url || "");
        if (!uri || isPublicAttachmentUrl(uri) || signedAttachmentUrls[uri]) continue;
        typeByUri.set(uri, attachment?.type || "file");
        privateUris.push(uri);
      }
    }
    const uniqueUris = [...new Set(privateUris)];
    if (!uniqueUris.length) return undefined;

    let active = true;
    (async () => {
      const resolved = {};
      try {
        for (let start = 0; start < uniqueUris.length; start += 50) {
          const chunk = uniqueUris.slice(start, start + 50);
          const res = await base44.functions.invoke("signAttachmentUrl", {
            conversation_id: conversation.id,
            file_uris: chunk,
          });
          Object.assign(resolved, res.data?.signed_urls || {});
        }
        if (!active) return;
        if (Object.keys(resolved).length) {
          setSignedAttachmentUrls((prev) => {
            const next = { ...prev, ...resolved };
            dmAttachmentUrlCache.set(conversation.id, { urls: next, expiresAt: Date.now() + DM_ATTACHMENT_CACHE_MS });
            return next;
          });
          for (const [uri, url] of Object.entries(resolved)) {
            if (typeByUri.get(uri) === "image") {
              const image = new window.Image();
              image.decoding = "async";
              image.src = url;
            }
          }
        }
        const unresolved = uniqueUris.some((uri) => !resolved[uri] && !signedAttachmentUrls[uri]);
        setBatchAttachmentSigningFailed(unresolved);
      } catch {
        if (active) setBatchAttachmentSigningFailed(true);
      }
    })();

    return () => { active = false; };
  }, [messages, conversation.id]);

  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setEditDraft("");
    setSendError("");
    setAttachments([]);
    setSpeakingMessageId(null);
    if (isCoreOS) {
      getCoreOsVoiceConfig({ force: true }).then(setCoreVoiceConfig).catch(() => {});
    }
    return () => stopCoreOsVoice();
  }, [conversation.id, isCoreOS]);

  useEffect(() => {
    if (!Array.isArray(messages)) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (nearBottomRef.current) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleMessageScroll = (event) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
  };

  const touchConversation = (lastMessage) =>
    base44.entities.Conversation.update(conversation.id, {
      last_message: lastMessage,
      last_sender_id: me.id,
    });

  const sendDirectMessageReliable = async (payload, requestId) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await base44.functions.invoke("directMessageOps", {
          action: "send",
          ...payload,
          client_request_id: requestId,
        });
        const message = res?.data?.message;
        if (!message?.id) throw new Error("Mensagem não confirmada pelo servidor");
        return message;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || error?.response?.status || 0);
        const code = error?.response?.data?.code;
        if (code === "muted" || [400, 401, 403].includes(status)) throw error;
        const retryable = status === 0 || status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
        if (!retryable || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Falha ao enviar mensagem");
  };

  const speakCoreMessage = (text, messageId = "auto", force = false) => {
    if (!text || (!force && (coreVoiceConfig?.enabled === false || coreVoiceConfig?.autoSpeak === false))) return;
    setSpeakingMessageId(messageId);
    playCoreOsVoice(text).finally(() => {
      setSpeakingMessageId((current) => current === messageId ? null : current);
    });
  };

  const toggleCoreMessageVoice = (message) => {
    unlockAiVoice();
    if (speakingMessageId === message.id) {
      stopCoreOsVoice();
      setSpeakingMessageId(null);
      return;
    }
    stopCoreOsVoice();
    speakCoreMessage(message.content, message.id, true);
  };

  const send = async () => {
    const content = draft.trim();
    if (isCoreOS) unlockAiVoice();
    if (isCoreOS && !canUseCore) {
      setSendError("Core OS é exclusivo para Staff e Owner.");
      return;
    }
    const mentionedUsers = mention.mentionedUsers;
    const mentionedUserIds = mention.mentionedUserIds;
    if ((!content && attachments.length === 0) || sending || attachmentUploading) return;
    setSending(true);
    setSendError("");
    try {
      if (isCoreOS) {
        let localAiPlan = null;
        try {
          const aiHistory = (messages || []).slice(-14).map((message) => ({
            role: message.sender_id === "core-os" ? "assistant" : "user",
            content: String(message.content || ""),
          }));
          const modelHistory = [...aiHistory, { role: "user", content }];
          const prepared = await prepareCoreAiPlan({
            history: modelHistory,
            mode: coreMode === "owner" ? "owner" : "staff",
            context: "direct_message",
            pathname: window.location.pathname,
            search: window.location.search,
          });
          localAiPlan = prepared.localAiPlan;
        } catch {
          localAiPlan = null;
        }

        const clientRequestId = crypto.randomUUID();
        const result = await base44.functions.invoke("coreOsDm", {
          action: "send",
          conversation_id: conversation.id,
          content,
          client_request_id: clientRequestId,
          ...(localAiPlan ? { local_ai_plan: localAiPlan } : {}),
        });
        const returned = result.data?.messages || [];
        if (result.data?.model || result.data?.ai_engine) setCoreModel(String(result.data.model || result.data.ai_engine).slice(0, 60));
        setCoreModelFallback(result.data?.ai_fallback === true);
        const clientActions = Array.isArray(result.data?.client_actions) ? result.data.client_actions : [];
        setDraft("");
        mention.clear();
        setMessages((prev) => [...(prev || []), ...returned]);
        const assistantMessage = [...returned].reverse().find((message) => message?.sender_id === "core-os");
        speakCoreMessage(result.data?.reply || assistantMessage?.content || "", assistantMessage?.id || "auto");
        const navigation = clientActions.find((a) => a && a.type === "navigate" && typeof a.path === "string" && a.path.startsWith("/") && !a.path.startsWith("//"));
        if (navigation) window.setTimeout(() => navigate(navigation.path), 350);
        return;
      }
      const replyMeta = replyTo ? {
        reply_to_id: replyTo.id,
        reply_author_name: replyTo.sender_name || "Usuário",
        reply_preview: replyTo.deleted ? "Mensagem original removida." : String(replyTo.content || "Figurinha").slice(0, 180),
      } : {};
      const optimisticId = `local:${crypto.randomUUID()}`;
      const optimistic = {
        id: optimisticId,
        conversation_id: conversation.id,
        sender_id: me.id,
        sender_name: me.name,
        content,
        attachments,
        participants: conversation.participants,
        mentions: mentionedUsers,
        edited: false,
        deleted: false,
        created_date: new Date().toISOString(),
        ...replyMeta,
      };
      setMessages((prev) => mergeMessageRows(prev || [], [optimistic]));

      let msg;
      const clientRequestId = crypto.randomUUID();
      try {
        msg = await sendDirectMessageReliable({
          conversation_id: conversation.id,
          content,
          attachments,
          mentions: mentionedUsers,
          ...replyMeta,
        }, clientRequestId);
      } catch (error) {
        setMessages((prev) => (prev || []).filter((m) => m.id !== optimisticId));
        throw error;
      }
      setDraft("");
      setAttachments([]);
      setReplyTo(null);
      mention.clear();
      setMessages((prev) => mergeMessageRows((prev || []).filter((m) => m.id !== optimisticId), [msg]));
      void touchConversation(content || `${attachments.length} anexo(s)`).catch(() => {});
      if (mentionedUserIds.length) {
        await base44.functions.invoke("processMentions", {
          content_type: "direct_message",
          content_id: msg.id,
          mentioned_user_ids: mentionedUserIds,
          context_url: "/mensagens",
        }).catch(() => {});
      }
    } catch (error) {
      const code = error?.response?.data?.code;
      setSendError(code === "muted" ? t("mute.dm_blocked") : t("dm.send_error"));
    } finally {
      setSending(false);
    }
  };

  const sendSticker = async (sticker) => {
    if (isCoreOS) return;
    const replyMeta = replyTo ? {
      reply_to_id: replyTo.id,
      reply_author_name: replyTo.sender_name || "Usuário",
      reply_preview: replyTo.deleted ? "Mensagem original removida." : String(replyTo.content || "Figurinha").slice(0, 180),
    } : {};
    let msg;
    try {
      msg = await sendDirectMessageReliable({
        conversation_id: conversation.id,
        content: "",
        sticker_url: sticker.image_url,
        ...replyMeta,
      }, crypto.randomUUID());
    } catch (error) {
      setSendError(error?.response?.data?.code === "muted" ? t("mute.dm_blocked") : t("dm.send_error"));
      return;
    }
    setMessages((prev) => (prev ? [...prev.filter((m) => m.id !== msg.id), msg] : prev));
    setReplyTo(null);
    await touchConversation("Figurinha");
  };

  const beginEdit = (message) => {
    if (message.deleted || message.sender_id !== me.id || message.sticker_url) return;
    setEditingId(message.id);
    setEditDraft(message.content || "");
  };

  const saveEdit = async (message) => {
    const content = editDraft.trim();
    if (!content || actionBusy) return;
    setActionBusy(`edit:${message.id}`);
    try {
      const res = await base44.functions.invoke("directMessageOps", { action: "edit", message_id: message.id, content });
      const updated = res.data?.message;
      setMessages((prev) => (prev || []).map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setEditingId(null);
      setEditDraft("");
      await touchConversation(content);
    } catch (error) {
      setSendError(error?.response?.data?.code === "muted" ? t("mute.dm_blocked") : t("dm.edit_error"));
    } finally {
      setActionBusy(null);
    }
  };

  const removeMessage = async (message) => {
    if (message.sender_id !== me.id || actionBusy || !window.confirm("Apagar esta mensagem?")) return;
    setActionBusy(`delete:${message.id}`);
    try {
      const res = await base44.functions.invoke("directMessageOps", { action: "delete", message_id: message.id });
      const updated = res.data?.message;
      setMessages((prev) => (prev || []).map((m) => {
        if (m.id === message.id) return { ...m, ...updated };
        if (m.reply_to_id === message.id) return { ...m, reply_preview: "Mensagem original removida." };
        return m;
      }));
      if (replyTo?.id === message.id) setReplyTo(null);
      await touchConversation("Mensagem removida");
    } finally {
      setActionBusy(null);
    }
  };

  const toggleReaction = async (message, emoji) => {
    if (isCoreOS) return;
    const existing = (reactions[message.id] || []).find(
      (r) => r.author_id === me.id && r.emoji === emoji
    );
    if (existing) {
      base44.entities.MessageReaction.delete(existing.id).catch(() => {});
      setReactions((prev) => ({
        ...prev,
        [message.id]: (prev[message.id] || []).filter((r) => r.id !== existing.id),
      }));
    } else {
      const reaction = await base44.entities.MessageReaction.create({
        message_id: message.id,
        conversation_id: conversation.id,
        emoji,
        author_id: me.id,
        author_name: me.name,
      });
      setReactions((prev) => ({
        ...prev,
        [message.id]: [...(prev[message.id] || []), reaction],
      }));
    }
  };

  const startCall = async () => {
    if (callStarting || inThisCall) return;
    setCallStarting(true);
    setSendError("");
    try {
      const res = await base44.functions.invoke("privateCallInvite", {
        action: "ring",
        conversation_id: conversation.id,
      });
      const invite = res?.data?.invite;
      if (!invite?.channel_code) throw new Error(res?.data?.error || "Convite de ligação não confirmado.");
      if (res.data?.message) setMessages((prev) => mergeMessageRows(prev || [], [res.data.message]));
      await setChannel({
        ...callChannel,
        code: invite.channel_code,
        conversationId: invite.conversation_id || conversation.id,
        peerUserId: res?.data?.peer_user_id || partnerId,
      });
    } catch (error) {
      const code = error?.response?.data?.code || error?.code;
      const serverMessage = error?.response?.data?.error || error?.message;
      setSendError(
        code === "muted"
          ? t("mute.call_blocked")
          : (serverMessage && serverMessage !== "Failed to fetch" ? serverMessage : t("dm.call_error"))
      );
    } finally {
      setCallStarting(false);
    }
  };

  const joinPrivateCall = async () => {
    setSendError("");
    try {
      await setChannel(callChannel);
    } catch (error) {
      setSendError(error?.code === "muted" ? t("mute.call_blocked") : t("dm.call_error"));
    }
  };

  const cleanDisplayContent = (text) => {
    let value = String(text || "").trim();
    const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) value = fenced[1].trim();
    if (value.startsWith("{") && value.endsWith("}")) {
      try {
        const parsed = JSON.parse(value);
        if (parsed?.reply) return String(parsed.reply);
      } catch {}
    }
    return String(text || "");
  };

  const translateSystemContent = (text) => {
    const value = cleanDisplayContent(text);
    const match = value.match(/^📞\s+(.+?)\s+(?:iniciou uma call privada\.|started a private call\.|inició una call privada\.)(?:\s+—.*)?$/i);
    return match ? t("dm.call_started", { name: match[1] }) : value;
  };

  const showIncomingCall = !inThisCall && partnerInCall;

  const renderContent = (message, own) => (
    <MentionText
      text={translateSystemContent(message.content)}
      mentions={message.mentions || []}
      mentionClassName={own ? "underline" : "bg-primary/20 text-primary"}
    />
  );

  if (isCoreOS && !canUseCore) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center p-6 text-center">
        <div>
          <Cpu className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-heading text-base font-bold">Core OS indisponível</h2>
          <p className="mt-1 text-sm text-muted-foreground">Este assistente é exclusivo para membros autorizados da Staff e para o Owner.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="relative overflow-hidden border-b border-border/60 bg-background/90">
        {partner.banner ? (
          <>
            <img src={partner.banner} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/94 via-background/78 to-background/62" />
          </>
        ) : null}
        <div className="relative z-[1] flex min-h-[78px] items-center gap-3 px-4 py-3">
        <button
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {partner.id ? (
          <UserQuickCard userId={partner.id}>
            <button type="button" className="flex min-w-0 items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-80">
              <ProfileAvatar name={partner.name} avatar={partner.avatar} size="sm" status={partner.status} frame={partner.frame} customFrameUrl={partner.custom_frame_url} />
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{partner.name}</span><span className="block text-[11px] text-muted-foreground">{t("dm.private_open_profile")}</span></span>
            </button>
          </UserQuickCard>
        ) : <><ProfileAvatar name={partner.name} avatar={partner.avatar} size="sm" status={partner.status} frame={partner.frame} customFrameUrl={partner.custom_frame_url} /><div className="min-w-0"><p className="truncate text-sm font-bold">{partner.name}</p><p className="text-[11px] text-muted-foreground">{t("dm.private")}</p></div></>}
        <div className="relative ml-auto flex items-center gap-2">
          {!isCoreOS && activeCallMutes.length > 0 && (
            <button type="button" onClick={() => setMuteManagerOpen((value) => !value)} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground">
              <VolumeX className="h-3.5 w-3.5" /> Silenciadas {activeCallMutes.length}
            </button>
          )}
          {!isCoreOS && callMuteEntry && (
            <button type="button" onClick={clearPartnerCallMute} className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/15" title={`Silenciado até ${new Date(callMuteEntry.until).toLocaleString("pt-BR")}`}>
              <VolumeX className="h-3.5 w-3.5" /> Tirar silenciamento
            </button>
          )}
          {muteManagerOpen && activeCallMutes.length > 0 && (
            <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-white/10 bg-zinc-950 p-3 shadow-2xl">
              <p className="mb-2 text-xs font-bold">Chamadas silenciadas</p>
              <div className="space-y-2">
                {activeCallMutes.map(([userId, entry]) => {
                  const until = typeof entry === "number" ? entry : Number(entry?.until || 0);
                  return (
                    <div key={userId} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold">{entry?.name || userId}</p>
                        <p className="text-[9px] text-muted-foreground">até {new Date(until).toLocaleString("pt-BR")}</p>
                      </div>
                      <button type="button" onClick={() => removeCallMute(userId)} className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold hover:bg-white/[0.06]">Tirar</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {isCoreOS ? <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-foreground"><Cpu className="h-3.5 w-3.5" />{coreMode === "owner" ? "Core OS Owner · acesso global" : "Core OS Staff · acesso limitado"}{coreModel ? (coreModel.startsWith("local_") ? ` · IA otimizada: ${coreModelFallback ? "fallback local" : "resposta instantânea"}` : ` · IA real: ${coreModel}${coreModelFallback ? " (fallback)" : ""}`) : ""}</span> : null}
          {!isCoreOS && inThisCall ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400">
              <PhoneIncoming className="h-3.5 w-3.5" />
              {t("dm.in_call")}
            </span>
          ) : !isCoreOS ? (
            <button
              onClick={startCall}
              disabled={callStarting}
              className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/25 disabled:cursor-wait disabled:opacity-60"
            >
              {callStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
              {callStarting ? "Ligando..." : t("dm.call")}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("dm.close_chat")}
        >
          <X className="h-4 w-4" />
        </button>
        </div>
      </header>

      {showIncomingCall && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-primary/10 px-4 py-2.5">
          <PhoneIncoming className="h-4 w-4 shrink-0 animate-pulse text-primary" />
          <p className="text-xs font-semibold">{t("dm.partner_in_private_call", { name: partner.name })}</p>
          <button
            onClick={joinPrivateCall}
            className="nebula-glow-sm ml-auto shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {t("dm.join_call")}
          </button>
        </div>
      )}
      {inThisCall && !isMobile && (
        <div className={cn(
          "z-20 border-border/60 bg-background/98 p-3 backdrop-blur transition-all duration-200",
          "shrink-0 border-b lg:absolute lg:bottom-[76px] lg:right-3 lg:top-[68px] lg:w-[min(44%,620px)] lg:rounded-2xl lg:border lg:shadow-2xl",
          anyScreenSharing ? "h-[300px] lg:h-auto" : "h-[260px] lg:h-auto"
        )}>
          <PrivateCallPanel partner={partner} />
        </div>
      )}
      {inThisCall && isMobile && mobileCallExpanded && (
        <div className="fixed inset-0 z-[70] flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
          <div className="safe-area-top flex shrink-0 items-center gap-3 border-b border-border/60 bg-background/98 px-3 pb-3 pt-2 shadow-lg backdrop-blur-xl">
            <ProfileAvatar name={partner.name} avatar={partner.avatar} size="sm" status={partner.status} frame={partner.frame} customFrameUrl={partner.custom_frame_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">Call privada · {partner.name}</p>
              <p className="text-[11px] font-semibold text-emerald-400">{t("dm.in_call")}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileCallExpanded(false)}
              className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-3 text-xs font-bold text-foreground"
              aria-label="Minimizar call e voltar ao chat"
            >
              <Minimize2 className="h-4 w-4" />
              Chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <PrivateCallPanel partner={partner} />
          </div>
        </div>
      )}
      <div ref={scrollRef} onScroll={handleMessageScroll} className={cn("scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3 md:px-4 transition-[margin] duration-200", inThisCall && "lg:mr-[45%]") }>
        {messages === null ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold">{t("dm.no_messages")}</p>
            <p className="text-xs text-muted-foreground">{t("dm.say_hello", { name: partner.name })}</p>
          </div>
        ) : (
          messages.map((m) => {
            const own = m.sender_id === me.id;
            const editing = editingId === m.id;
            const officialScreening = String(m.content || "").includes("🛡️ NÉBULA OFICIAL · MODERAÇÃO") && String(m.sender_name || "").startsWith("Moderação ·");
            const originalReply = m.reply_to_id ? (messages || []).find((row) => row.id === m.reply_to_id) : null;
            const replyRemoved = !!originalReply?.deleted || m.reply_preview === "Mensagem original removida.";
            return (
              <div id={`dm-message-${m.id}`} key={m.id} className={`group flex scroll-mt-6 ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[74%] rounded-xl border px-3 py-1.5 ${
                    officialScreening ? "rounded-bl-sm border-amber-500/40 bg-amber-500/[0.08] text-foreground shadow-[0_0_30px_rgba(245,158,11,0.06)]" : own ? "rounded-br-sm border-primary/20 bg-primary text-primary-foreground" : "rounded-bl-sm border-border/60 bg-card"
                  }`}
                >
                  {officialScreening && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-black/20 px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-300">
                      <span className="grid h-5 w-5 place-items-center rounded-md bg-amber-500/15">N</span>
                      Solicitação oficial Nébula
                    </div>
                  )}
                  {m.reply_to_id && (
                    <button
                      type="button"
                      disabled={!originalReply || replyRemoved}
                      onClick={() => document.getElementById(`dm-message-${m.reply_to_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      className={cn("mb-1.5 block w-full rounded-lg border-l-2 px-2.5 py-1.5 text-left disabled:cursor-default", own ? "border-white/50 bg-black/10" : "border-white/20 bg-white/[0.035]")}
                    >
                      <p className={cn("text-[10px] font-bold", own ? "text-primary-foreground/80" : "text-muted-foreground")}>Respondendo a {m.reply_author_name || "mensagem"}</p>
                      <p className={cn("mt-0.5 line-clamp-2 text-[11px]", own ? "text-primary-foreground/70" : "text-muted-foreground/80")}>{replyRemoved ? "Mensagem original removida." : (m.reply_preview || "Mensagem anterior")}</p>
                    </button>
                  )}
                  {m.deleted ? (
                    <p className={cn("text-xs italic", own ? "text-primary-foreground/70" : "text-muted-foreground")}>Mensagem removida.</p>
                  ) : editing ? (
                    <div className="flex items-center gap-2">
                      <Input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="h-9 bg-background text-xs text-foreground" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(m); } if (e.key === "Escape") setEditingId(null); }} />
                      <Button size="icon" className="h-9 w-9" onClick={() => saveEdit(m)} disabled={!editDraft.trim() || !!actionBusy}>{actionBusy === `edit:${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : m.sticker_url ? (
                    <Image src={m.sticker_url} alt="Figurinha" fittingType="fit" className="max-h-44 w-40 rounded-xl" />
                  ) : (
                    <>
                      {m.content && <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{renderContent(m, own)}</p>}
                      <MessageAttachments
                        attachments={m.attachments}
                        conversationId={conversation.id}
                        resolvedUrls={signedAttachmentUrls}
                        deferSigning={!batchAttachmentSigningFailed}
                      />
                    </>
                  )}
                  <div className={cn("mt-0.5 flex items-center justify-end gap-2 text-[9px]", own ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {m.edited && !m.deleted && <span>editada</span>}
                    {isCoreOS && m.sender_id === "core-os" && !m.deleted && m.content && (
                      <button
                        type="button"
                        onClick={() => toggleCoreMessageVoice(m)}
                        className="inline-grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-foreground"
                        aria-label={speakingMessageId === m.id ? t("coreui.stop_voice") : t("coreui.listen")}
                        title={speakingMessageId === m.id ? t("coreui.stop_voice") : t("coreui.listen")}
                      >
                        {speakingMessageId === m.id ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      </button>
                    )}
                    <span>{formatLocalTime(m.created_date)}</span>
                  </div>
                  {!editing && !isCoreOS && (
                    <div className={cn("mt-1 flex flex-wrap items-center gap-0.5 border-t pt-1", own ? "border-white/15" : "border-white/[0.06]")}>
                      {!m.deleted && <button type="button" onClick={() => setReplyTo(m)} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", own ? "hover:bg-black/10" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")}><Reply className="h-3 w-3" />Responder</button>}
                      {own && !m.deleted && !m.sticker_url && !(m.attachments || []).length && <button type="button" onClick={() => beginEdit(m)} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", own ? "hover:bg-black/10" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")}><Pencil className="h-3 w-3" />Editar</button>}
                      {own && !m.deleted && <button type="button" onClick={() => removeMessage(m)} disabled={actionBusy === `delete:${m.id}`} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50", own ? "hover:bg-black/10" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")}>{actionBusy === `delete:${m.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Apagar</button>}
                    </div>
                  )}
                  {!isCoreOS && !m.deleted && <MessageReactions reactions={reactions[m.id] || []} myId={me.id} onToggle={(emoji) => toggleReaction(m, emoji)} />}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && <p role="alert" className={cn("border-t border-border/60 px-4 pt-2 text-xs text-destructive", inThisCall && "lg:mr-[45%]")}>{sendError}</p>}
      {replyTo && !isCoreOS && (
        <div className={cn("flex items-center gap-3 border-t border-border/60 bg-secondary/30 px-4 py-2", inThisCall && "lg:mr-[45%]")}>
          <Reply className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold">Respondendo a {replyTo.sender_name || "mensagem"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{replyTo.deleted ? "Mensagem original removida." : (replyTo.content || "Figurinha")}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.05]"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <footer className={cn("relative flex items-end gap-2 border-t border-border/60 p-2.5 transition-[margin] duration-200", inThisCall && "lg:mr-[45%]")}>
        <MentionMenu open={mention.open} matches={mention.matches} active={mention.active} onActive={mention.setActive} onPick={mention.pick} className="left-3" userGroupLabel="Pessoa da conversa" />
        <div className="min-w-0 flex-1">
          {!isCoreOS && (
            <div className="flex flex-wrap items-center gap-1">
              <AttachmentPicker attachments={attachments} onChange={setAttachments} onUploadingChange={setAttachmentUploading} disabled={sending} />
              <VoiceRecorderButton
                disabled={sending || attachmentUploading || attachments.length >= 5}
                onUploadingChange={setAttachmentUploading}
                onUploaded={(audio) => setAttachments((current) => [...current, audio])}
                compact
              />
            </div>
          )}
          <Input
            value={draft}
            onChange={(e) => mention.update(e.target.value)}
            onKeyDown={(e) => mention.keyDown(e, send)}
            placeholder={`Mensagem para ${partner.name}... — use @ para marcar`}
            disabled={sending}
          />
        </div>
        {!isCoreOS && <StickerPicker me={me} onSend={sendSticker} />}
        <Button size="icon" onClick={send} disabled={sending || attachmentUploading || (!draft.trim() && attachments.length === 0)} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </footer>
    </div>
  );
}