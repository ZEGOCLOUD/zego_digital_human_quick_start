import { CONFIG } from "../config";

let appId = CONFIG.DEFAULT_APP_ID || "";
let serverSecret = "";

export const setAppId = (newAppId = "") => {
  console.log("setAppId", newAppId);
  appId = newAppId || CONFIG.DEFAULT_APP_ID;
}

export const setServerSecret = (newServerSecret = "") => {
  console.log("setServerSecret", newServerSecret);
  serverSecret = newServerSecret || "";
}

const apiRequest = async (path, data = {}, method = "POST", params = {}) => {
  const url = CONFIG.API_BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
  try {
    const response = await fetch(url + (method === "GET" ? "?" + new URLSearchParams(params).toString() : ""), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": appId || "",
        "X-Server-Secret": serverSecret || "",
      },
      body: method === "POST" ? JSON.stringify(data) : null,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("API请求失败:", error);
    throw error;
  }
}

export const post = (path, data = {}) => apiRequest(path, data, "POST");
export const get = (path, params = {}) => apiRequest(path, {}, "GET", params);

// 数字人资产相关 API
export const commonAPI = {
  // 获取 zego token
  async getZegoToken(userId) {
    return get("ZegoToken", { userId });
  }
};

// 数字人资产相关 API
export const digitalHumanAPI = {
  // 获取数字人形象列表
  async getDigitalHumanList(offset = 0, limit = 20, fetchMode = 1) {
    return post(
      "GetDigitalHumanList",
      {
        Offset: offset,
        Limit: limit,
        FetchMode: fetchMode,
      }
    );
  },
  async getTimbreList(digitalHumanId, offset = 0, limit = 20) {
    return post(
      "GetTimbreList",
      {
        DigitalHumanId: digitalHumanId,
        Offset: offset,
        Limit: limit,
      }
    );
  },
  async getDigitalHumanInfo(digitalHumanId) {
    return post(
      "GetDigitalHumanInfo",
      {
        DigitalHumanId: digitalHumanId,
      }
    );
  }
};

// 实时流相关API
export const streamAPI = {
   // 查询所有运行中的数字人视频流任务
   async queryStreamTasks() {
    return post(
      "QueryDigitalHumanStreamTasks",
      {}
    );
  },
  // 创建数字人视频流任务
  async createStreamTask(config) {
    return post("CreateDigitalHumanStreamTask", config);
  },

  // 停止数字人视频流任务
  async stopStreamTask(taskId) {
    return post("StopDigitalHumanStreamTask", { TaskId: taskId });
  },

  // 获取视频流任务状态
  async getStreamTaskStatus(taskId) {
    return post("GetDigitalHumanStreamTaskStatus", { TaskId: taskId });
  },
};

// 驱动相关API
export const driveAPI = {
  // 文本驱动数字人
  async driveByText(taskId, text, ttsConfig) {
    return post(
      "DriveByText",
      {
        TaskId: taskId,
        Text: text,
        TTSConfig: ttsConfig
      }
    );
  },

  // 音频驱动数字人
  async driveByAudio(taskId, audioUrl) {
    return post(
      "DriveByAudio",
      {
        TaskId: taskId,
        AudioUrl: audioUrl
      }
    );
  },

  // 动作驱动数字人
  async doAction(taskId, action) {
    return post(
      "DoAction",
      {
        TaskId: taskId,
        Action: action
      }
    );
  },

  // 打断驱动任务
  async interruptDriveTask(taskId) {
    return post(
      "InterruptDriveTask",
      {
        TaskId: taskId
      }
    );
  },

  // RTC流式音频驱动数字人
  async driveByRtcStream(taskId, rtcConfig) {
    return post(
      "DriveByRTCStream",
      {
        TaskId: taskId,
        RTCConfig: rtcConfig,
      }
    );
  },
};
