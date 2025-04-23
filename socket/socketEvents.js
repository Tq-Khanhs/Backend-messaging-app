// Socket event constants
export const EVENTS = {
    // Connection events
    CONNECT: "connect",
    DISCONNECT: "disconnect",
    ERROR: "error",
  
    // User events
    USER_STATUS: "user_status",
    USER_JOINED: "user_joined",
    USER_LEFT: "user_left",
  
    // Conversation events
    JOIN_CONVERSATION: "join_conversation",
    LEAVE_CONVERSATION: "leave_conversation",
  
    // Message events
    NEW_MESSAGE: "new_message",
    MESSAGE_READ: "message_read",
    MESSAGES_READ: "messages_read",
    MESSAGE_DELETED: "message_deleted",
    MESSAGE_RECALLED: "message_recalled",
    TYPING_INDICATOR: "typing_indicator",
    MENTION: "mention",
  
    // Group events
    JOIN_GROUP: "join_group",
    GROUP_CREATED: "group_created",
    GROUP_UPDATED: "group_updated",
    GROUP_DISSOLVED: "group_dissolved",
    GROUP_ADDED: "group_added",
    GROUP_REMOVED: "group_removed",
    GROUP_AVATAR_UPDATED: "group_avatar_updated",
  
    // Member events
    MEMBER_ADDED: "member_added",
    MEMBER_REMOVED: "member_removed",
    MEMBER_LEFT: "member_left",
    MEMBER_ROLE_UPDATED: "member_role_updated",
    MESSAGE_READ_BY_MEMBER: "message_read_by_member",
  
    // Friend events
    FRIEND_REQUEST: "friend_request",
    FRIEND_REQUEST_RESPONSE: "friend_request_response",
    FRIEND_REQUEST_CANCELED: "friend_request_canceled",
    FRIEND_REMOVED: "friend_removed",
  }
  
  // Helper function to create a user-specific event name
  export const userEvent = (userId, event) => `${event}_${userId}`
  