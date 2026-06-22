"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Hash,
  LogOut,
  Maximize2,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Video,
  VideoOff
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { CallSignal, Message, Profile, Room } from "@/lib/types";

const colors = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#d97706", "#0891b2"];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsChecked, setRoomsChecked] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setProfileChecked(false);
      setRooms([]);
      setRoomsChecked(false);
      setSelectedRoomId("");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session?.user.id) return;
    setProfileChecked(false);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) setNotice(error.message);
    setProfile(data);
    setProfileChecked(true);
  }, [session?.user.id]);

  const loadProfiles = useCallback(async () => {
    if (!session?.user.id || !selectedRoomId) return;

    const { data, error } = await supabase
      .from("room_members")
      .select("user_id, profile:profiles(*)")
      .eq("room_id", selectedRoomId)
      .order("joined_at", { ascending: true });

    if (error) {
      setNotice(error.message);
      return;
    }

    const roomProfiles = ((data ?? []) as unknown as Array<{ profile: Profile | null }>)
      .map((item) => item.profile)
      .filter((item): item is Profile => Boolean(item));
    setProfiles(roomProfiles);
    const firstFriend = roomProfiles.find((item) => item.id !== session.user.id);
    setSelectedId((current) => current || firstFriend?.id || "");
  }, [selectedRoomId, session?.user.id]);

  const loadRooms = useCallback(async () => {
    if (!session?.user.id) return;
    setRoomsChecked(false);

    const { data, error } = await supabase
      .from("room_members")
      .select("room_id, room:rooms(*)")
      .eq("user_id", session.user.id)
      .order("joined_at", { ascending: true });

    if (error) {
      setNotice(error.message);
      setRoomsChecked(true);
      return;
    }

    const joinedRooms = ((data ?? []) as unknown as Array<{ room: Room | null }>)
      .map((item) => item.room)
      .filter((item): item is Room => Boolean(item));
    setRooms(joinedRooms);
    setRoomsChecked(true);
    setSelectedRoomId((current) => {
      if (current && joinedRooms.some((room) => room.id === current)) return current;
      const savedRoomId = window.localStorage.getItem(`friend-circle:selected-room:${session.user.id}`);
      if (savedRoomId && joinedRooms.some((room) => room.id === savedRoomId)) return savedRoomId;
      return joinedRooms[0]?.id || "";
    });
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
    loadRooms();
  }, [loadProfile, loadRooms, session]);

  useEffect(() => {
    if (!session?.user.id || !selectedRoomId) return;
    window.localStorage.setItem(`friend-circle:selected-room:${session.user.id}`, selectedRoomId);
  }, [selectedRoomId, session?.user.id]);

  useEffect(() => {
    setProfiles([]);
    setMessages([]);
    setDeletedIds(new Set());
    setSelectedId("");
    if (selectedRoomId) loadProfiles();
  }, [loadProfiles, selectedRoomId]);

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const selectedRoom = useMemo(
    () => rooms.find((item) => item.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const visibleMessages = useMemo(
    () => messages.filter((item) => !deletedIds.has(item.id)),
    [deletedIds, messages]
  );

  const loadMessages = useCallback(async () => {
    if (!session?.user.id || !selectedId || !selectedRoomId) return;

    const { data: messageRows, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", selectedRoomId)
      .or(
        `and(sender_id.eq.${session.user.id},recipient_id.eq.${selectedId}),and(sender_id.eq.${selectedId},recipient_id.eq.${session.user.id})`
      )
      .order("created_at", { ascending: true });

    const { data: deletionRows, error: deletionError } = await supabase
      .from("message_deletions")
      .select("message_id")
      .eq("user_id", session.user.id);

    if (messageError || deletionError) {
      setNotice(messageError?.message ?? deletionError?.message ?? "Could not load messages.");
      return;
    }

    setMessages(messageRows ?? []);
    setDeletedIds(new Set((deletionRows ?? []).map((row) => row.message_id as string)));
  }, [selectedId, selectedRoomId, session?.user.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!session?.user.id) return;

    const channel = supabase
      .channel("circle-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadProfiles)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, loadRooms)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, () => {
        loadRooms();
        loadProfiles();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadMessages)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_deletions" }, loadMessages)
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_events" }, (payload) => {
        const row = payload.new as { room_id?: string; from_user?: string; to_user?: string; is_typing?: boolean };
        if (row.to_user !== session.user.id || row.room_id !== selectedRoomId) return;
        setTypingUsers((current) => {
          const next = new Set(current);
          if (row.is_typing && row.from_user) next.add(row.from_user);
          if (!row.is_typing && row.from_user) next.delete(row.from_user);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMessages, loadProfiles, loadRooms, selectedRoomId, session?.user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length, selectedId]);

  const saveTyping = useCallback(
    async (isTyping: boolean) => {
      if (!session?.user.id || !selectedId || !selectedRoomId) return;
      await supabase.from("typing_events").upsert({
        room_id: selectedRoomId,
        from_user: session.user.id,
        to_user: selectedId,
        is_typing: isTyping,
        updated_at: new Date().toISOString()
      });
    },
    [selectedId, selectedRoomId, session?.user.id]
  );

  useEffect(() => {
    if (!body.trim()) {
      saveTyping(false);
      return;
    }

    saveTyping(true);
    const timeout = window.setTimeout(() => saveTyping(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [body, saveTyping]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!session?.user.id || !selectedId || !selectedRoomId || !body.trim()) return;

    const text = body.trim();
    setBody("");
    await saveTyping(false);
    const { error } = await supabase.from("messages").insert({
      room_id: selectedRoomId,
      sender_id: session.user.id,
      recipient_id: selectedId,
      body: text
    });

    if (error) setNotice(error.message);
  }

  async function deleteHistory() {
    if (!session?.user.id || !visibleMessages.length) return;
    const rows = visibleMessages.map((message) => ({
      message_id: message.id,
      user_id: session.user.id
    }));
    const { error } = await supabase.from("message_deletions").upsert(rows);
    if (error) setNotice(error.message);
    await loadMessages();
  }

  async function deleteForEveryone(messageId: string) {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, body: "Message deleted" })
      .eq("id", messageId);

    if (error) setNotice(error.message);
  }

  async function switchRoomByCode(event: FormEvent) {
    event.preventDefault();
    const roomCode = roomCodeInput.replace(/\D/g, "").slice(0, 10);

    if (roomCode.length !== 10) {
      setNotice("Room code must be exactly 10 digits.");
      return;
    }

    const { data, error } = await supabase.rpc("join_private_room", {
      room_code: roomCode
    });

    if (error) {
      setNotice(error.message);
      return;
    }

    const joinedRoom = data as Room | null;
    setRoomCodeInput("");
    setNotice("");
    await loadRooms();
    if (joinedRoom?.id) setSelectedRoomId(joinedRoom.id);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="authShell">
        <section className="authPanel">
          <div className="logo big">FC</div>
          <h1>Connect Supabase</h1>
          <p>Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then restart the dev server.</p>
        </section>
      </main>
    );
  }

  if (!authReady) {
    return <LoadingScreen label="Opening your chat" />;
  }

  if (!session) {
    return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} notice={notice} setNotice={setNotice} />;
  }

  if (!profileChecked) {
    return <LoadingScreen label="Loading your profile" />;
  }

  if (!profile) {
    return <ProfileSetup userId={session.user.id} onDone={loadProfile} notice={notice} setNotice={setNotice} />;
  }

  if (!roomsChecked) {
    return <LoadingScreen label="Restoring your room" />;
  }

  if (!selectedRoom) {
    return (
      <RoomGate
        onDone={loadRooms}
        profile={profile}
        notice={notice}
        setNotice={setNotice}
      />
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">FC</div>
          <div>
            <h1>Friend Circle</h1>
            <p>{profiles.length}/10 in this room</p>
          </div>
        </div>

        <div className="privacy">
          <ShieldCheck size={18} />
          <span>Room code {selectedRoom.code}</span>
        </div>

        <div className="roomSwitcher">
          <label>Room</label>
          <select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        <form className="roomCodeSwitch" onSubmit={switchRoomByCode}>
          <input
            inputMode="numeric"
            pattern="[0-9]{10}"
            placeholder="Enter another room code"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <button type="submit">
            <Hash size={16} />
            Switch
          </button>
        </form>

        <div className="people">
          {profiles
            .filter((item) => item.id !== session.user.id)
            .map((person) => (
              <button
                className={`person ${selectedId === person.id ? "active" : ""}`}
                key={person.id}
                onClick={() => setSelectedId(person.id)}
              >
                <Avatar profile={person} />
                <span>{person.display_name}</span>
                {typingUsers.has(person.id) && <small>typing</small>}
              </button>
            ))}
        </div>

        <button className="ghostButton" onClick={() => supabase.auth.signOut()}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <section className="chat">
        <header className="chatHeader">
          <div className="chatTitle">
            {selectedProfile ? <Avatar profile={selectedProfile} /> : <UserRound size={28} />}
            <div>
              <h2>{selectedProfile?.display_name ?? "Choose a friend"}</h2>
              <p>{selectedProfile ? `${selectedRoom.name} private room` : "Pick someone from this room."}</p>
            </div>
          </div>
          <div className="headerActions">
            <button className="iconButton" onClick={deleteHistory} title="Delete history for me" disabled={!selectedId}>
              <Trash2 size={19} />
            </button>
          </div>
        </header>

        {selectedProfile ? (
          <>
            <CallPanel me={profile} peer={selectedProfile} circleId={selectedRoom.id} />

            <div className="messages">
              {visibleMessages.map((message) => {
                const mine = message.sender_id === session.user.id;
                return (
                  <div className={`messageRow ${mine ? "mine" : ""}`} key={message.id}>
                    <div className={`bubble ${message.deleted_for_everyone ? "deleted" : ""}`}>
                      <p>{message.deleted_for_everyone ? "Message deleted" : message.body}</p>
                      <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {mine && !message.deleted_for_everyone && (
                        <button onClick={() => deleteForEveryone(message.id)} title="Delete for everyone">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {typingUsers.has(selectedId) && <div className="typingDot">typing...</div>}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                aria-label="Message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={`Message ${selectedProfile.display_name}`}
                maxLength={2000}
              />
              <button className="sendButton" type="submit" disabled={!body.trim()}>
                <Send size={19} />
              </button>
            </form>
          </>
        ) : (
          <div className="emptyState">Share room code {selectedRoom.code} with friends, then start chatting.</div>
        )}
      </section>

      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loadingShell">
      <div className="loadingMark">FC</div>
      <p>{label}</p>
    </main>
  );
}

function AuthScreen({
  authMode,
  setAuthMode,
  notice,
  setNotice
}: {
  authMode: "signin" | "signup";
  setAuthMode: (mode: "signin" | "signup") => void;
  notice: string;
  setNotice: (notice: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const authCall =
      authMode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await authCall;
    setNotice(error ? error.message : authMode === "signup" ? "Check your email if confirmations are enabled." : "");
  }

  return (
    <main className="authShell">
      <form className="authPanel" onSubmit={submit}>
        <div className="logo big">FC</div>
        <h1>Private chat for 10 friends</h1>
        <p>Login, message, call, share screen, and keep history under your control.</p>
        <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
        />
        <button className="primaryButton" type="submit">
          {authMode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button className="linkButton" type="button" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>
          {authMode === "signin" ? "Need an account?" : "Already have an account?"}
        </button>
        {notice && <p className="formNotice">{notice}</p>}
      </form>
    </main>
  );
}

function ProfileSetup({
  userId,
  onDone,
  notice,
  setNotice
}: {
  userId: string;
  onDone: () => void;
  notice: string;
  setNotice: (notice: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("profiles").insert({
      id: userId,
      display_name: name.trim(),
      avatar_color: color
    });

    if (error) {
      setNotice(error.message);
      return;
    }

    onDone();
  }

  return (
    <main className="authShell">
      <form className="authPanel" onSubmit={submit}>
        <div className="logo big">FC</div>
        <h1>Your circle name</h1>
        <p>This name is visible only to signed-in members of your private circle.</p>
        <input placeholder="Display name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
        <div className="swatches">
          {colors.map((item) => (
            <button
              type="button"
              className={color === item ? "selectedSwatch" : ""}
              key={item}
              style={{ backgroundColor: item }}
              onClick={() => setColor(item)}
              aria-label={`Choose ${item}`}
            />
          ))}
        </div>
        <button className="primaryButton" type="submit">
          Continue
        </button>
        {notice && <p className="formNotice">{notice}</p>}
      </form>
    </main>
  );
}

function RoomGate({
  onDone,
  profile,
  notice,
  setNotice
}: {
  onDone: () => void;
  profile: Profile;
  notice: string;
  setNotice: (notice: string) => void;
}) {
  const [mode, setMode] = useState<"join" | "create">("join");
  const [code, setCode] = useState("");
  const [roomName, setRoomName] = useState(`${profile.display_name}'s room`);

  const normalizedCode = code.replace(/\D/g, "").slice(0, 10);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (normalizedCode.length !== 10) {
      setNotice("Room code must be exactly 10 digits.");
      return;
    }

    const { error } =
      mode === "create"
        ? await supabase.rpc("create_private_room", {
            room_name: roomName.trim(),
            room_code: normalizedCode
          })
        : await supabase.rpc("join_private_room", {
            room_code: normalizedCode
          });

    if (error) {
      setNotice(error.message);
      return;
    }

    setNotice("");
    onDone();
  }

  return (
    <main className="authShell">
      <form className="authPanel" onSubmit={submit}>
        <div className="logo big">FC</div>
        <h1>Enter a private room</h1>
        <p>Only people with the same 10 digit room code can see each other. Each room allows up to 10 members.</p>

        <div className="segmented">
          <button className={mode === "join" ? "selectedSegment" : ""} type="button" onClick={() => setMode("join")}>
            <Hash size={16} />
            Join
          </button>
          <button className={mode === "create" ? "selectedSegment" : ""} type="button" onClick={() => setMode("create")}>
            <Plus size={16} />
            Create
          </button>
        </div>

        {mode === "create" && (
          <input
            placeholder="Room name"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            required
            minLength={2}
            maxLength={40}
          />
        )}

        <input
          inputMode="numeric"
          pattern="[0-9]{10}"
          placeholder="10 digit room code"
          value={normalizedCode}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        <button className="primaryButton" type="submit">
          {mode === "create" ? "Create room" : "Join room"}
        </button>
        <button className="linkButton" type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
        {notice && <p className="formNotice">{notice}</p>}
      </form>
    </main>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  return (
    <div className="avatar" style={{ backgroundColor: profile.avatar_color }}>
      {profile.display_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function CallPanel({ me, peer, circleId }: { me: Profile; peer: Profile; circleId: string }) {
  const [callState, setCallState] = useState<"idle" | "calling" | "connected">("idle");
  const [roomId, setRoomId] = useState("");
  const [pinnedVideo, setPinnedVideo] = useState<"local" | "remote" | null>(null);
  const [localMedia, setLocalMedia] = useState<"none" | "camera" | "screen">("none");
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);

  const sendSignal = useCallback(
    async (type: CallSignal["type"], payload: Record<string, unknown>, room = roomId || [me.id, peer.id].sort().join("-")) => {
      await supabase.from("call_signals").insert({
        room_id: room,
        circle_id: circleId,
        sender_id: me.id,
        recipient_id: peer.id,
        type,
        payload
      });
    },
    [circleId, me.id, peer.id, roomId]
  );

  const ensurePeer = useCallback(async () => {
    if (peerConnection.current) return peerConnection.current;

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal("ice", event.candidate.toJSON() as unknown as Record<string, unknown>);
    };

    connection.ontrack = (event) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
      setCallState("connected");
    };

    peerConnection.current = connection;
    return connection;
  }, [sendSignal]);

  const renegotiate = useCallback(
    async (connection: RTCPeerConnection, room: string) => {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal("offer", { type: offer.type, sdp: offer.sdp }, room);
    },
    [sendSignal]
  );

  const attachLocalStream = useCallback(async (screen = false) => {
    const stream = screen
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = stream;
    setLocalMedia(screen ? "screen" : "camera");
    if (localVideo.current) localVideo.current.srcObject = stream;

    const connection = await ensurePeer();
    connection.getSenders().forEach((sender) => connection.removeTrack(sender));
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));

    if (screen) {
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setLocalMedia("none");
        localStream.current = null;
        if (localVideo.current) localVideo.current.srcObject = null;
      });
    }

    return connection;
  }, [ensurePeer]);

  const startCall = useCallback(
    async (screen = false) => {
      const room = `${circleId}:${[me.id, peer.id].sort().join("-")}`;
      setRoomId(room);
      setCallState("calling");
      const connection = await attachLocalStream(screen);
      await renegotiate(connection, room);
    },
    [attachLocalStream, circleId, me.id, peer.id, renegotiate]
  );

  const shareMedia = useCallback(
    async (screen = false) => {
      const room = roomId || `${circleId}:${[me.id, peer.id].sort().join("-")}`;
      setRoomId(room);
      if (callState === "idle") setCallState("calling");
      const connection = await attachLocalStream(screen);
      await renegotiate(connection, room);
    },
    [attachLocalStream, callState, circleId, me.id, peer.id, renegotiate, roomId]
  );

  const stopLocalMedia = useCallback(async () => {
    const connection = peerConnection.current;
    const stream = localStream.current;

    if (connection && stream) {
      const trackIds = new Set(stream.getTracks().map((track) => track.id));
      connection
        .getSenders()
        .filter((sender) => sender.track && trackIds.has(sender.track.id))
        .forEach((sender) => connection.removeTrack(sender));
    }

    stream?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    setLocalMedia("none");
    if (localVideo.current) localVideo.current.srcObject = null;

    if (connection && roomId && callState !== "idle") {
      await renegotiate(connection, roomId);
    }
  }, [callState, renegotiate, roomId]
  );

  const hangup = useCallback(async () => {
    await sendSignal("hangup", {});
    localStream.current?.getTracks().forEach((track) => track.stop());
    peerConnection.current?.close();
    peerConnection.current = null;
    localStream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setPinnedVideo(null);
    setLocalMedia("none");
    setCallState("idle");
  }, [sendSignal]);

  useEffect(() => {
    const channel = supabase
      .channel(`calls-${me.id}-${peer.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `recipient_id=eq.${me.id}` },
        async (payload) => {
          const signal = payload.new as CallSignal;
          if (signal.sender_id !== peer.id || signal.circle_id !== circleId) return;

          if (signal.type === "hangup") {
            localStream.current?.getTracks().forEach((track) => track.stop());
            peerConnection.current?.close();
            peerConnection.current = null;
            setPinnedVideo(null);
            setLocalMedia("none");
            setCallState("idle");
            return;
          }

          const connection = await ensurePeer();

          if (signal.type === "offer") {
            setRoomId(signal.room_id);
            setCallState("calling");
            await connection.setRemoteDescription(
              new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
            );
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendSignal("answer", { type: answer.type, sdp: answer.sdp }, signal.room_id);
          }

          if (signal.type === "answer") {
            await connection.setRemoteDescription(
              new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
            );
            setCallState("connected");
          }

          if (signal.type === "ice") {
            await connection.addIceCandidate(new RTCIceCandidate(signal.payload as unknown as RTCIceCandidateInit));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circleId, ensurePeer, me.id, peer.id, sendSignal]);

  return (
    <section className={`callPanel ${pinnedVideo ? "isPinnedMode" : ""}`}>
      <div className={`videoGrid ${pinnedVideo ? "hasPinnedVideo" : ""}`}>
        <div className={`videoTile ${pinnedVideo === "local" ? "isPinnedVideo" : ""} ${pinnedVideo === "remote" ? "isHiddenVideo" : ""}`}>
          <video ref={localVideo} autoPlay muted playsInline />
          <div className="videoOverlay">
            <span>{localMedia === "screen" ? "Your screen" : localMedia === "camera" ? "Your camera" : "Camera off"}</span>
            <button
              className="pinButton"
              type="button"
              onClick={() => setPinnedVideo(pinnedVideo === "local" ? null : "local")}
              title={pinnedVideo === "local" ? "Exit pinned view" : "Pin your video or screen"}
            >
              {pinnedVideo === "local" ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
        <div className={`videoTile ${pinnedVideo === "remote" ? "isPinnedVideo" : ""} ${pinnedVideo === "local" ? "isHiddenVideo" : ""}`}>
          <video ref={remoteVideo} autoPlay playsInline />
          <div className="videoOverlay">
            <span>{peer.display_name}</span>
            <button
              className="pinButton"
              type="button"
              onClick={() => setPinnedVideo(pinnedVideo === "remote" ? null : "remote")}
              title={pinnedVideo === "remote" ? "Exit pinned view" : "Pin shared screen or video"}
            >
              {pinnedVideo === "remote" ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>
      <div className="callActions">
        <button className="iconTextButton" onClick={() => (callState === "idle" ? startCall(false) : shareMedia(false))}>
          <Video size={18} />
          Camera
        </button>
        <button className="iconTextButton" onClick={() => (callState === "idle" ? startCall(true) : shareMedia(true))}>
          <MonitorUp size={18} />
          Screen
        </button>
        {localMedia !== "none" && (
          <button className="iconTextButton" onClick={stopLocalMedia}>
            <VideoOff size={18} />
            Stop
          </button>
        )}
        {callState !== "idle" ? (
          <button className="dangerButton" onClick={hangup}>
            <PhoneOff size={18} />
            End
          </button>
        ) : (
          <span className="callStatus">
            <Phone size={16} />
            Ready
          </span>
        )}
      </div>
    </section>
  );
}
