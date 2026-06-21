export type Profile = {
  id: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
};

export type Room = {
  id: string;
  code: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  deleted_for_everyone: boolean;
  created_at: string;
};

export type CallSignal = {
  id: string;
  room_id: string;
  circle_id: string;
  sender_id: string;
  recipient_id: string;
  type: "offer" | "answer" | "ice" | "hangup";
  payload: Record<string, unknown>;
  created_at: string;
};
