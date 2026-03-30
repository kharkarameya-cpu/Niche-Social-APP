'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Pusher from 'pusher-js';
import EmojiPicker from 'emoji-picker-react';
import { ArrowLeft, Send, Zap, Image as ImageIcon, Video, Phone, Smile, PhoneCall, VideoIcon } from 'lucide-react';
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from '@/lib/demo-chat';

type Partner = { id: string; name: string; age: number; city?: string; profileImageUrl?: string | null };
type Conversation = {
  id: string;
  partner: Partner;
  level: number;
  totalXp: number;
  unlockedFeatures: string[];
};

type Msg = {
  id: string;
  senderId: string;
  content: string;
  type: string;
  xpAwarded?: number;
  createdAt: string;
  sender?: { id: string; name: string };
};

const isMediaUrl = (value: string) => {
  const v = value.trim();
  return v.startsWith('/api/uploads/media/') || v.startsWith('/api/uploads/image/') || /^https?:\/\//i.test(v);
};

const maskUrls = (value: string) => value.replace(/(https?:\/\/\S+|www\.\S+)/gi, '[link hidden]');

export default function ChatDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [myId, setMyId] = useState('');
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [xpHint, setXpHint] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [callHint, setCallHint] = useState('');
  const [placingCall, setPlacingCall] = useState(false);

  const isDemo = id?.startsWith('demo_conv_');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token || !id) return;

    const run = async () => {
      setLoading(true);
      try {
        const meRes = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          setMyId(meData?.user?.id ?? 'me');
        }

        if (isDemo) {
          const demoConv = DEMO_CONVERSATIONS.find((c) => c.id === id);
          setConversation((demoConv as unknown as Conversation) ?? null);
          setMessages((DEMO_MESSAGES[id] ?? []) as unknown as Msg[]);
          setLoading(false);
          return;
        }

        const [convRes, msgRes] = await Promise.all([
          fetch(`/api/conversations/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/conversations/${id}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!convRes.ok) {
          router.replace('/chat');
          return;
        }

        const convData = await convRes.json();
        const msgData = msgRes.ok ? await msgRes.json() : { messages: [] };

        setConversation(convData?.conversation ?? null);
        setMessages(msgData?.messages ?? []);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id, isDemo, router]);

  useEffect(() => {
    if (!id || isDemo) return;
    const token = localStorage.getItem('auth_token');
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!token || !key || !cluster) return;

    const pusher = new Pusher(key, {
      cluster,
      channelAuthorization: {
        endpoint: '/api/pusher/auth',
        transport: 'ajax',
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const channel = pusher.subscribe(`private-conv-${id}`);
    const onMessage = (payload: { message?: Msg; xpReason?: string }) => {
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message!]);
      }
      if (payload?.xpReason && payload.xpReason !== 'ok') {
        setXpHint(payload.xpReason.replaceAll('_', ' '));
        setTimeout(() => setXpHint(''), 2200);
      }
    };
    const onCallSignal = (payload: { type?: string; mode?: 'voice' | 'video'; fromUserId?: string }) => {
      if (!payload?.type || payload.fromUserId === myId) return;
      if (payload.type === 'call_request') {
        setCallHint(`Incoming ${payload.mode === 'video' ? 'video' : 'voice'} call request`);
        setTimeout(() => setCallHint(''), 2800);
      }
    };
    channel.bind('message:new', onMessage);
    channel.bind('call:signal', onCallSignal);

    return () => {
      channel.unbind('message:new', onMessage);
      channel.unbind('call:signal', onCallSignal);
      pusher.unsubscribe(`private-conv-${id}`);
      pusher.disconnect();
    };
  }, [id, isDemo, myId]);

  const canSend = useMemo(() => {
    if (!conversation) return false;
    return (conversation.level ?? 1) >= 1;
  }, [conversation]);

  const unlocked = useMemo(() => new Set(conversation?.unlockedFeatures ?? ['text']), [conversation]);
  const canEmoji = unlocked.has('emoji');
  const canGif = unlocked.has('gif');
  const canImage = unlocked.has('image');
  const canVideo = unlocked.has('video');
  const canVoiceCall = unlocked.has('voice_call');
  const canVideoCall = unlocked.has('video_call');

  const sendCallRequest = async (mode: 'voice' | 'video') => {
    if (!conversation) return;

    const allowed = mode === 'video' ? canVideoCall : canVoiceCall;
    if (!allowed) {
      setCallHint(mode === 'video' ? 'Video calls unlock at LVL 25' : 'Voice calls unlock at LVL 20');
      setTimeout(() => setCallHint(''), 2200);
      return;
    }

    if (isDemo) {
      setCallHint(`${mode === 'video' ? 'Video' : 'Voice'} call requested (demo)`);
      setTimeout(() => setCallHint(''), 2200);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    setPlacingCall(true);
    try {
      const res = await fetch(`/api/conversations/${id}/call/signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: 'call_request', mode }),
      });

      const data = await res.json().catch(() => ({}));
      setCallHint(res.ok ? `${mode === 'video' ? 'Video' : 'Voice'} call request sent` : data?.error || 'Call request failed');
      setTimeout(() => setCallHint(''), 2200);
    } finally {
      setPlacingCall(false);
    }
  };

  const sendTypedMessage = async (type: string, content: string) => {
    if (!content.trim() || !conversation) return;

    if (isDemo) {
      const newMsg: Msg = {
        id: `demo_local_${Date.now()}`,
        senderId: myId || 'me',
        sender: { id: myId || 'me', name: 'You' },
        content: content.trim(),
        type,
        xpAwarded: 2,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, content: content.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.message) {
        setMessages((prev) => [...prev, data.message]);
      }
      if (data?.xpReason && data.xpReason !== 'ok') {
        setXpHint(data.xpReason.replaceAll('_', ' '));
        setTimeout(() => setXpHint(''), 2200);
      }
    } finally {
      setSending(false);
    }
  };

  const uploadAndSendMedia = async (file: File, type: 'image' | 'gif' | 'video') => {
    if (type === 'image' && !canImage) return;
    if (type === 'gif' && !canGif) return;
    if (type === 'video' && !canVideo) return;

    if (isDemo) {
      setXpHint('media upload unavailable in demo chat');
      setTimeout(() => setXpHint(''), 2200);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const upRes = await fetch('/api/uploads/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const up = await upRes.json().catch(() => ({}));
      if (upRes.ok && up?.url) {
        await sendTypedMessage(type, up.url);
      }
    } finally {
      setUploadingMedia(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending || !conversation) return;
    await sendTypedMessage('text', text);
    setText('');
  };

  if (loading || !conversation) {
    return (
      <div className="h-full min-h-[60vh] flex items-center justify-center bg-transparent">
        <div className="w-10 h-10 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-transparent flex flex-col">
      <header className="px-4 py-3 border-b border-white/10 dark:border-white/5 flex items-center gap-3 bg-transparent backdrop-blur-sm">
        <button onClick={() => router.push('/chat')} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
          <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-500 text-white font-semibold flex items-center justify-center overflow-hidden">
          {conversation.partner.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conversation.partner.profileImageUrl} alt={conversation.partner.name} className="w-full h-full object-cover" />
          ) : (
            conversation.partner.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-black dark:text-white truncate">
            {conversation.partner.name}, {conversation.partner.age}
          </p>
          <p className="text-xs text-rose-500">LVL {conversation.level} · {conversation.totalXp} XP</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => sendCallRequest('voice')}
            disabled={placingCall || !canVoiceCall}
            title={canVoiceCall ? 'Start voice call' : 'Unlocks at LVL 20'}
            className="h-9 w-9 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 inline-flex items-center justify-center"
          >
            <PhoneCall className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          </button>
          <button
            type="button"
            onClick={() => sendCallRequest('video')}
            disabled={placingCall || !canVideoCall}
            title={canVideoCall ? 'Start video call' : 'Unlocks at LVL 25'}
            className="h-9 w-9 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 inline-flex items-center justify-center"
          >
            <VideoIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          </button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-white/10 dark:border-white/5 flex items-center gap-2 text-xs text-gray-500 bg-transparent">
        <Zap className="w-3.5 h-3.5 text-rose-500" />
        Unlocked: {conversation.unlockedFeatures.join(', ') || 'text'}
      </div>

      {callHint ? (
        <div className="px-4 py-2 text-xs border-b border-white/10 dark:border-white/5 bg-blue-500/10 backdrop-blur-sm text-blue-700 dark:text-blue-200">
          {callHint}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((m) => {
          const mine = m.senderId === myId || m.senderId === 'me';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine
                  ? 'bg-rose-500 text-white rounded-br-md'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 rounded-bl-md'
                }`}
              >
                {m.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.content} alt="sent image" className="max-h-64 rounded-lg" />
                ) : m.type === 'gif' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.content} alt="sent gif" className="max-h-64 rounded-lg" />
                ) : m.type === 'video' ? (
                  <video src={m.content} controls className="max-h-64 rounded-lg" />
                ) : m.type === 'voice_note' ? (
                  <p>📞 Voice call request sent</p>
                ) : m.type === 'emoji' ? (
                  <p className="text-2xl leading-none">{m.content}</p>
                ) : m.type === 'text' && isMediaUrl(m.content) ? (
                  <p>📎 Media attachment</p>
                ) : (
                  <p>{maskUrls(m.content)}</p>
                )}
                <p className={`text-[10px] mt-1 ${mine ? 'text-rose-100' : 'text-gray-500'}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {typeof m.xpAwarded === 'number' ? ` · +${m.xpAwarded}xp` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </main>

      <form onSubmit={submit} className="p-3 border-t border-white/10 dark:border-white/5 bg-transparent backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {xpHint ? (
          <p className="text-[11px] mb-1 text-amber-500">No XP: {xpHint}</p>
        ) : null}

        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            disabled={!canEmoji || sending}
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="h-8 px-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs disabled:opacity-40 inline-flex items-center gap-1 flex-shrink-0"
          >
            <Smile className="w-3.5 h-3.5" /> Emoji
          </button>

          <div className="h-8 px-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs inline-flex items-center gap-1 flex-shrink-0">
            <ImageIcon className="w-3.5 h-3.5" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canImage || uploadingMedia || sending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAndSendMedia(file, 'image');
                e.currentTarget.value = '';
              }}
              className="text-[10px] w-20 sm:w-[120px]"
            />
          </div>

          <div className="h-8 px-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs inline-flex items-center gap-1 flex-shrink-0">
            <ImageIcon className="w-3.5 h-3.5" />
            <input
              type="file"
              accept="image/gif"
              disabled={!canGif || uploadingMedia || sending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAndSendMedia(file, 'gif');
                e.currentTarget.value = '';
              }}
              className="text-[10px] w-16 sm:w-[100px]"
            />
          </div>

          <div className="h-8 px-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs inline-flex items-center gap-1 flex-shrink-0">
            <Video className="w-3.5 h-3.5" />
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={!canVideo || uploadingMedia || sending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAndSendMedia(file, 'video');
                e.currentTarget.value = '';
              }}
              className="text-[10px] w-16 sm:w-[100px]"
            />
          </div>

          <button
            type="button"
            disabled={!canVoiceCall || sending}
            onClick={() => sendTypedMessage('voice_note', 'Voice call request')}
            className="h-8 px-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs disabled:opacity-40 inline-flex items-center gap-1 flex-shrink-0"
          >
            <Phone className="w-3.5 h-3.5" /> Voice call
          </button>
        </div>

        {showEmojiPicker && canEmoji ? (
          <div className="mb-2 p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900 overflow-hidden">
            <EmojiPicker
              width="100%"
              height={320}
              onEmojiClick={(emojiData) => {
                void sendTypedMessage('emoji', emojiData.emoji);
                setShowEmojiPicker(false);
              }}
              previewConfig={{ showPreview: false }}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canSend ? 'Type a message...' : 'Chat locked'}
            disabled={!canSend || sending}
            className="flex-1 h-11 rounded-xl border border-gray-300 dark:border-gray-700 px-3 bg-white dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            type="submit"
            disabled={!canSend || sending || !text.trim()}
            className="h-11 w-11 rounded-xl bg-rose-500 text-white disabled:opacity-50 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
