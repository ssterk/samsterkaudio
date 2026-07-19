import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Comment } from "../lib/api";
import { formatDuration } from "../lib/format";
import { useSession } from "../lib/auth-client";
import type { PlayerHandle } from "./Player";

const POLL_MS = 15_000;

export function Comments({ trackId, playerRef }: { trackId: string; playerRef: React.RefObject<PlayerHandle | null> }) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [pinTime, setPinTime] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api.comments(trackId).then((r) => setComments(r.comments)).catch(() => {});
  }, [trackId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const timestampMs = pinTime ? Math.round((playerRef.current?.getCurrentTime() ?? 0) * 1000) : undefined;
      await api.createComment(trackId, { body: body.trim(), timestampMs });
      setBody("");
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!replyBody.trim()) return;
    await api.createComment(trackId, { body: replyBody.trim(), parentId });
    setReplyBody("");
    setReplyTo(null);
    load();
  }

  async function toggleResolved(comment: Comment) {
    await api.resolveComment(comment.id, !comment.resolved);
    load();
  }

  async function handleDelete(id: string) {
    await api.deleteComment(id);
    load();
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesFor = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <div>
      <div className="mb-4 font-display text-xl font-black tracking-[0.03em]">
        COMMENTS ({topLevel.length})
      </div>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-2 border border-line bg-bg2 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="LEAVE A COMMENT…"
          rows={2}
          className="resize-none border border-line bg-bg px-3 py-2.5 text-sm text-cream placeholder:text-dim focus:outline focus:outline-1 focus:outline-accent"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-muted">
            <input type="checkbox" checked={pinTime} onChange={(e) => setPinTime(e.target.checked)} />
            PIN TO CURRENT PLAYHEAD POSITION
          </label>
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="cursor-pointer border-none bg-accent px-5 py-2 font-display text-sm font-black tracking-[0.1em] text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            POST
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {topLevel.map((comment) => (
          <div key={comment.id} className={`border px-4 py-3 ${comment.resolved ? "border-line opacity-50" : "border-line"}`}>
            <CommentRow
              comment={comment}
              currentUserId={session?.user.id}
              onSeek={(ms) => playerRef.current?.seekTo(ms / 1000)}
              onToggleResolved={() => toggleResolved(comment)}
              onDelete={() => handleDelete(comment.id)}
              onReply={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
            />

            {repliesFor(comment.id).map((reply) => (
              <div key={reply.id} className="ml-6 mt-2 border-l-2 border-line pl-4">
                <CommentRow
                  comment={reply}
                  currentUserId={session?.user.id}
                  onSeek={(ms) => playerRef.current?.seekTo(ms / 1000)}
                  onDelete={() => handleDelete(reply.id)}
                />
              </div>
            ))}

            {replyTo === comment.id && (
              <div className="ml-6 mt-2 flex gap-2 pl-4">
                <input
                  autoFocus
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReply(comment.id)}
                  placeholder="REPLY…"
                  className="flex-1 border border-line bg-bg px-3 py-2 text-sm text-cream focus:outline focus:outline-1 focus:outline-accent"
                />
                <button
                  onClick={() => handleReply(comment.id)}
                  className="cursor-pointer border-none bg-accent px-4 font-display text-xs font-black tracking-[0.1em] text-bg"
                >
                  REPLY
                </button>
              </div>
            )}
          </div>
        ))}
        {topLevel.length === 0 && (
          <div className="border border-dashed border-line px-8 py-10 text-center font-mono text-xs tracking-wide text-dim">
            NO COMMENTS YET
          </div>
        )}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onSeek,
  onToggleResolved,
  onDelete,
  onReply,
}: {
  comment: Comment;
  currentUserId: string | undefined;
  onSeek: (ms: number) => void;
  onToggleResolved?: () => void;
  onDelete: () => void;
  onReply?: () => void;
}) {
  const canModerate = currentUserId === comment.userId;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-cream">{comment.authorName || comment.authorEmail}</span>
        {comment.authorRole === "owner" && (
          <span className="border border-accent px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-accent">OWNER</span>
        )}
        {comment.timestampMs !== null && (
          <button
            onClick={() => onSeek(comment.timestampMs!)}
            className="cursor-pointer border-none bg-transparent font-mono text-[10px] text-accent hover:underline"
          >
            {formatDuration(comment.timestampMs / 1000)}
          </button>
        )}
        <span className="text-dim">{new Date(comment.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-1 text-sm text-cream/90">{comment.body}</div>
      <div className="mt-1.5 flex gap-3 font-mono text-[10px] tracking-[0.08em] text-dim">
        {onReply && (
          <button onClick={onReply} className="cursor-pointer border-none bg-transparent text-dim hover:text-cream">
            REPLY
          </button>
        )}
        {onToggleResolved && (
          <button onClick={onToggleResolved} className="cursor-pointer border-none bg-transparent text-dim hover:text-cream">
            {comment.resolved ? "UNRESOLVE" : "RESOLVE"}
          </button>
        )}
        {canModerate && (
          <button onClick={onDelete} className="cursor-pointer border-none bg-transparent text-dim hover:text-accent">
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}
