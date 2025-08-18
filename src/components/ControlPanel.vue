<script setup>
import { ref, reactive, computed, onMounted, watch, inject } from "vue";
import { streamAPI, driveAPI, commonAPI } from "../utils/api";
import { generateId, debounce } from "../utils";
import { CONFIG } from "../config";
import LoadableSelect from "./LoadableSelect.vue";

const isDev = import.meta.env.DEV;

// 接收 props
const props = defineProps({
  appConfig: Object,
  taskState: Object,
  isMobile: Boolean,
  showMessage: Function,
  updateTaskState: Function,
});

// 定义 emits
const emit = defineEmits(['load-more-timbres', 'timbre-type-change']);

// 响应式状态
const loading = reactive({
  createTask: false,
  stopTask: false,
  textDrive: false,
  audioDrive: false,
  actionDrive: false, // 动作驱动 loading 状态
  interrupt: false,
  rtcDrive: false,
});

// 表单数据
const textForm = reactive({
  content: "你好，我是数字人小助手，很高兴为您服务！",
  timbreId: "",
  speechRate: 0,
  pitchRate: 0,
  volume: 50,
});

const audioForm = reactive({ url: '' });
const actionForm = reactive({ action: '' });

// 音色类型切换 - 与父组件同步
const usePublicTimbres = computed({
  get: () => props.appConfig.usePublicTimbres,
  set: (value) => {
    emit('timbre-type-change', value);
  }
});

// 当前选中的动作预览信息
const selectedActionPreview = ref(null);

// 当前活动的标签页
const activeTab = ref("text");

// 是否正在推流
const isPublishing = ref(false);

// 推流 streamId
let publishStreamId = "";

// 本地流
// RTC推流相关全局变量
let localStream = null;

// 是否登录房间
const isRoomLogined = ref(false);
// 是否注册了房间流更新回调
const roomStreamUpdateRegistered = ref(false);

// 计算属性
const canCreateTask = computed(() => {
  return (
    props.appConfig.selectedDigitalHuman &&
    !props.taskState.currentTaskId &&
    !loading.createTask
  );
});

const canOperate = computed(() => !!props.taskState.currentTaskId);

const controlClass = computed(() => props.isMobile ? "control-mobile" : "control-desktop");

// 防抖的文本驱动函数
const debouncedTextDrive = debounce(async () => await handleTextDrive(), 300);

// 防抖的动作驱动函数
const debouncedActionDrive = debounce(async () => await handleActionDrive(), 300);

// 处理音色类型切换
const handleTimbreTypeChange = () => {
  // 清空当前选择的音色
  textForm.timbreId = "";

  console.log(`切换到${usePublicTimbres.value ? '公共' : '私有'}音色`);
};

// 处理动作选择
const handleActionSelect = () => {
  if (actionForm.action) {
    const actions = props.appConfig.selectedDigitalHuman?.Actions || [];
    selectedActionPreview.value = actions.find(action => action.Action === actionForm.action);
  } else {
    selectedActionPreview.value = null;
  }
};

// 重置动作驱动状态
const resetActionDriveState = () => {
  actionForm.action = "";
  selectedActionPreview.value = null;
  console.log("动作驱动状态已重置");
};

// 创建数字人视频流任务
const handleCreateTask = async () => {
  if (!canCreateTask.value) {
    props.showMessage("warning", "请先选择数字人形象和音色");
    return;
  }
  loading.createTask = true;
  try {
    // 统一生成参数（只生成一次）
    const roomId = generateId("test_room_");
    const streamId = generateId("stream_");
    const publishStreamId = generateId("local_stream_");
    const userID = "user_" + Math.random().toString(36).substr(2, 8);
    const userName = "访客" + Math.floor(Math.random() * 10000);
    const appId = Number(CONFIG.DEFAULT_APP_ID);
    const server = CONFIG.DEFAULT_SERVER;
    const tokenRes = await commonAPI.getZegoToken(userID);
    const token = tokenRes.token;

    // 先登录房间（用 roomId）
    await zg.loginRoom(roomId, token, { userID, userName });
    console.log("[webrtc] 登录房间成功", roomId, { userID, userName });
    isRoomLogined.value = true;

    // 注册流状态更新回调（只注册一次）
    if (!roomStreamUpdateRegistered.value) {
      zg.on('roomStreamUpdate', async (roomID, updateType, streamList, extendedData) => {
        console.log('[WebRTC] roomStreamUpdate', { roomID, updateType, streamList, extendedData });
        if (updateType === 'ADD' && streamList.length > 0) {
          // 只拉取第一条流，实际业务建议遍历
          const streamID = streamList[0].streamID;
          try {
            const remoteStream = await zg.startPlayingStream(streamID);
            const remoteView = zg.createRemoteStreamView(remoteStream, { objectFit: 'contain' });
            remoteView.play("remote-video");
            console.log('[WebRTC] 已拉取并播放远端流', streamID);
            if (typeof props.updateTaskState === 'function') {
              props.updateTaskState({ isStreaming: true });
            }
          } catch (err) {
            console.error('[WebRTC] 拉流失败', err);
          }
        } else if (updateType === 'DELETE') {
          // 停止拉流
          for (const stream of streamList) {
            zg.stopPlayingStream(stream.streamID);
          }
          if (typeof props.updateTaskState === 'function') {
            props.updateTaskState({ isStreaming: false, currentTask: null });
          }
        }
      });
      roomStreamUpdateRegistered.value = true;
    }

    // 创建任务（用同一个 roomId/streamId）
    const config = {
      DigitalHumanConfig: {
        DigitalHumanId: props.appConfig.selectedDigitalHuman.DigitalHumanId,
        BackgroundColor: "#00000000",
        Layout: props.appConfig.layoutConfig.digitalHuman,
      },
      TTL: 3600,
      RTCConfig: {
        RoomId: roomId,      // 必须和 loginRoom 一致
        StreamId: streamId,  // 新生成
      },
      VideoConfig: props.appConfig.videoConfig,
    };

    const result = await streamAPI.createStreamTask(config);
    props.updateTaskState({
      currentTaskId: result.Data.TaskId,
      taskStatus: 1,
      isStreaming: false,
      currentTask: {
        RoomId: roomId,
        StreamId: streamId,
        PublishStreamId: publishStreamId,
        UserID: userID,
        UserName: userName,
        Token: token,
        appId,
        server,
      }
    });

    // 任务创建成功后，重置动作驱动状态，确保使用新形象的动作列表
    resetActionDriveState();

    props.showMessage("success", "任务创建成功，可以开始驱动数字人了");
  } catch (error) {
    console.error("创建任务失败", error);
    isRoomLogined.value = false;
    props.updateTaskState({
      currentTaskId: null,
      taskStatus: null,
      isStreaming: false,
    });

    // 创建任务失败时也重置动作驱动状态
    resetActionDriveState();

    props.showMessage("error", `创建失败: ${error.message}`);
  } finally {
    loading.createTask = false;
  }
};

// 停止数字人视频流任务
const handleStopTask = async () => {
  if (!canOperate.value) return;
  loading.stopTask = true;
  try {
    // 先停止推流和销毁流
    if (isPublishing.value && publishStreamId) {
      stopRTCPublishTask();
    }
    zg.logoutRoom();
    isRoomLogined.value = false;
    await streamAPI.stopStreamTask(
      props.taskState.currentTaskId
    );
    props.updateTaskState({
      currentTaskId: null,
      taskStatus: null,
      isStreaming: false,
      driveList: [],
      currentTask: null,
      isRoomLogined: false,
    });

    // 重置动作驱动状态
    resetActionDriveState();

    props.showMessage("success", "任务已停止");
  } catch (error) {
    props.showMessage("error", `停止失败: ${error.message}`);
  } finally {
    loading.stopTask = false;
  }
};

// 文本驱动数字人
const handleTextDrive = async () => {
  if (!canOperate.value || !textForm.content.trim()) {
    props.showMessage("warning", "请输入文本内容");
    return;
  }

  loading.textDrive = true;

  try {
    const ttsConfig = {
      TimbreId: textForm.timbreId || props.appConfig.selectedTimbre?.TimbreId,
      SpeechRate: textForm.speechRate,
      PitchRate: textForm.pitchRate,
      Volume: textForm.volume,
    };

    if (!ttsConfig.TimbreId) {
      props.showMessage("error", "音色(TimbreId)不能为空，请先选择音色");
      loading.textDrive = false;
      return;
    }

    const result = await driveAPI.driveByText(
      props.taskState.currentTaskId,
      textForm.content,
      ttsConfig
    );
  } catch (error) {
    console.error(error); // 方便调试
    let code = error?.Code || error?.response?.Code;
    let msg = error?.Message || error?.response?.Message || error?.message;
    if (code || msg) {
      props.showMessage("error", `文本驱动失败: [${code ?? ''}] ${msg ?? ''}`);
    } else {
      props.showMessage("error", "文本驱动失败，未知错误");
    }
  } finally {
    loading.textDrive = false;
  }
};

// 动作驱动数字人
const handleActionDrive = async () => {
  if (!canOperate.value || !actionForm.action.trim()) {
    props.showMessage("warning", "请选择要执行的动作");
    return;
  }

  loading.actionDrive = true;

  try {
    const result = await driveAPI.doAction(
      props.taskState.currentTaskId,
      actionForm.action
    );

    if (result && result.Code === 0) {
      props.showMessage("success", `动作 "${actionForm.action}" 执行成功`);
    } else {
      const code = result?.Code || "";
      const msg = result?.Message || "执行失败";
      props.showMessage("error", `动作驱动失败: [${code}] ${msg}`);
    }
  } catch (error) {
    console.error("动作驱动错误:", error); // 方便调试
    let code = error?.Code || error?.response?.Code;
    let msg = error?.Message || error?.response?.Message || error?.message;
    if (code || msg) {
      props.showMessage("error", `动作驱动失败: [${code ?? ''}] ${msg ?? ''}`);
    } else {
      props.showMessage("error", "动作驱动失败，未知错误");
    }
  } finally {
    loading.actionDrive = false;
  }
};

// 音频驱动数字人
const handleAudioDrive = async () => {
  if (!canOperate.value || !audioForm.url.trim()) {
    props.showMessage("warning", "请输入音频URL");
    return;
  }

  loading.audioDrive = true;

  try {
    const result = await driveAPI.driveByAudio(
      props.taskState.currentTaskId,
      audioForm.url
    );
    // 更新驱动列表
    // updateDriveList();
  } catch (error) {
    let code = error?.Code || error?.response?.Code;
    let msg = error?.Message || error?.response?.Message || error?.message;
    if (code) {
      props.showMessage("error", `音频驱动失败: [${code}] ${msg}`);
    } else {
      props.showMessage("error", `音频驱动失败: ${msg}`);
    }
  } finally {
    loading.audioDrive = false;
  }
};

// 中断驱动任务
const handleInterrupt = async () => {
  if (!canOperate.value) return;

  loading.interrupt = true;

  try {
    await driveAPI.interruptDriveTask(
      props.taskState.currentTaskId
    );
  } catch (error) {
    props.showMessage("error", `中断失败: ${error.message}`);
  } finally {
    loading.interrupt = false;
  }
};

const startRTCPublishTask = async () => {
  const streamId = props.taskState.currentTask.PublishStreamId;
  const rtc_sup = await checkSystemRequirements();
  if (!rtc_sup.webRTC) {
    props.showMessage("error", "浏览器不支持WebRTC，请使用其他浏览器");
    return;
  }

  localStream = await zg.createZegoStream();
  await zg.startPublishingStream(streamId, localStream);
  publishStreamId = streamId;
  isPublishing.value = true;
  console.log("[webrtc] 推流成功");
}

const startDigitalTask = async () => {
  const { currentTask, currentTaskId }  = props.taskState;
  const { RoomId, PublishStreamId } = currentTask;
  const rtcConfig = { RoomId, StreamId: PublishStreamId };
  await driveAPI.driveByRtcStream(currentTaskId, rtcConfig);
}

const stopRTCPublishTask = () => {
  try {
    zg.stopPublishingStream(publishStreamId);
  } catch(e) {
    console.error("[webrtc] 停止推流异常", e);
  }
  try {
    zg.destroyStream(localStream);
  } catch(e) {
    console.error("[webrtc] 销毁流异常", e);
  }
  isPublishing.value = false;
  localStream = null;
  publishStreamId = "";
}

// RTC流式音频驱动数字人
const handleRtcDrive = async () => {
  if (!canOperate.value || !isRoomLogined.value || !props.taskState.currentTask?.RoomId || !props.taskState.currentTask?.PublishStreamId) {
    props.showMessage("warning", "房间未登录或参数缺失，请稍后再试");
    return;
  }

  if (isPublishing.value) {
    stopRTCPublishTask();
  } else {
    loading.rtcDrive = true;
    try {
      await startRTCPublishTask();
      await startDigitalTask();
      props.showMessage("success", "RTC流式音频驱动已发送");
    } catch (error) {
      console.error("[webrtc] 推流或驱动失败", error);
      props.showMessage("error", `RTC流式音频驱动失败: ${error.message}`);

      stopRTCPublishTask();
    } finally {
      loading.rtcDrive = false;
    }
  }
};

const checkSystemRequirements = async () => {
  const rtc_sup = await zg.checkSystemRequirements();
  console.log("checkSystemRequirements", rtc_sup);
  return {
    webRTC: rtc_sup.webRTC,
    microphone: rtc_sup.microphone,
    videoCodec: rtc_sup.videoCodec,
  };
}

// 切换标签页
const switchTab = (tab) => {
  activeTab.value = tab;
};

// 销毁全部任务
const handleDestroyAllTasks = async () => {
  loading.stopTask = true;
  try {
    const res = await streamAPI.queryStreamTasks();
    console.log("queryStreamTasks 返回：", res);
    const data = res?.Data;
    let tasks = [];
    if (Array.isArray(data)) {
      tasks = data;
    } else if (Array.isArray(data?.Tasks)) {
      tasks = data.Tasks;
    } else if (Array.isArray(data?.TaskList)) {
      tasks = data.TaskList;
    }
    if (tasks.length === 0) {
      props.showMessage("info", "当前没有运行中的任务");
      return;
    }
    // 只停止 RoomId 以 test_room_ 开头的任务
    const filteredTasks = tasks.filter(task => typeof task.RoomId === 'string' && task.RoomId.startsWith('test_room_'));
    if (filteredTasks.length === 0) {
      props.showMessage("info", "没有可销毁的 test_room_ 任务");
      return;
    }
    for (const task of filteredTasks) {
      try {
        await streamAPI.stopStreamTask(task.TaskId);
      } catch (e) {
        // 忽略单个任务停止失败
      }
    }
    props.updateTaskState({
      currentTaskId: null,
      taskStatus: null,
      isStreaming: false,
      driveList: [],
    });
    props.showMessage("success", "已销毁全部 room_ 任务");
  } catch (err) {
    props.showMessage("error", `销毁全部任务失败: ${err.message}`);
  } finally {
    loading.stopTask = false;
  }
};

// 监听数字人或外部音色ID变化，自动设置音色选择
watch(() => props.appConfig.selectedTimbre,
  (newTimbre) => {
    textForm.timbreId = newTimbre?.TimbreId || "";
  },
  { immediate: true }
);

// 监听数字人变化，清除动作选择
watch(
  () => props.appConfig.selectedDigitalHuman,
  (newDigitalHuman, oldDigitalHuman) => {
    // 当数字人切换时（不包括初始化），清除当前选择的动作
    if (oldDigitalHuman && newDigitalHuman?.DigitalHumanId !== oldDigitalHuman?.DigitalHumanId) {
      actionForm.action = "";
      selectedActionPreview.value = null;
    }
  }
);

// 组件挂载时初始化
onMounted(() => {
  // 设置默认音色
  if (props.appConfig.selectedTimbre) {
    textForm.timbreId = props.appConfig.selectedTimbre.id;
  }
});

const zg = inject('zg');
</script>

<template>
  <div :class="controlClass">
    <!-- 任务控制区 -->
    <div class="task-section">
      <h3>任务控制</h3>
      <div class="task-buttons">
        <button
          class="task-btn create-btn"
          :disabled="!canCreateTask"
          @click="handleCreateTask"
        >
          <div class="loading-spinner" v-if="loading.createTask"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
            />
          </svg>
          {{ loading.createTask ? "创建中..." : "创建任务" }}
        </button>

        <button
          class="task-btn stop-btn"
          :disabled="!canOperate"
          @click="handleStopTask"
        >
          <div class="loading-spinner" v-if="loading.stopTask"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"
            />
          </svg>
          {{ loading.stopTask ? "停止中..." : "停止任务" }}
        </button>

        <button
          class="task-btn interrupt-btn"
          :disabled="!canOperate"
          @click="handleInterrupt"
        >
          <div class="loading-spinner" v-if="loading.interrupt"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM8.5 7L12 10.5 15.5 7 17 8.5 13.5 12 17 15.5 15.5 17 12 13.5 8.5 17 7 15.5 10.5 12 7 8.5 8.5 7z"
            />
          </svg>
          {{ loading.interrupt ? "中断中..." : "中断" }}
        </button>

        <button
          class="task-btn destroy-btn"
          :disabled="loading.stopTask"
          @click="handleDestroyAllTasks"
        >
          <div class="loading-spinner" v-if="loading.stopTask"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6"/>
          </svg>
          {{ loading.stopTask ? "销毁中..." : "销毁全部" }}
        </button>
      </div>
    </div>

    <!-- 驱动控制区 -->
    <div class="drive-section">
      <h3>驱动控制</h3>

      <!-- 标签页 -->
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'text' }"
          @click="switchTab('text')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17h18v2H3zm0-6h18v2H3zm0-6h18v2H3z" />
          </svg>
          文本驱动
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'action' }"
          @click="switchTab('action')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17h18v2H3zm0-6h18v2H3zm0-6h18v2H3z" />
          </svg>
          动作驱动
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'audio' }"
          @click="switchTab('audio')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2s-2-.9-2-2V4c0-1.1.9-2 2-2zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H6c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"
            />
          </svg>
          音频驱动
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'rtc' }"
          @click="switchTab('rtc')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.07-6.07l-1.41 1.41M6.34 17.66l-1.41 1.41m12.02 0l-1.41-1.41M6.34 6.34L4.93 4.93" />
          </svg>
          RTC流式音频驱动
        </button>
      </div>

      <!-- 文本驱动面板 -->
      <div class="drive-panel" v-show="activeTab === 'text'">
        <div class="form-group">
          <label>文本内容</label>
          <textarea
            v-model="textForm.content"
            placeholder="请输入要说的文本内容（最多1800字）"
            :maxlength="1800"
            rows="3"
            class="text-input"
          ></textarea>
          <div class="char-count">{{ textForm.content.length }}/1800</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>语速 ({{ textForm.speechRate }})</label>
            <input
              type="range"
              v-model="textForm.speechRate"
              min="-500"
              max="500"
              class="range-input"
            />
          </div>
          <div class="form-group">
            <label>语调 ({{ textForm.pitchRate }})</label>
            <input
              type="range"
              v-model="textForm.pitchRate"
              min="-500"
              max="500"
              class="range-input"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>音量 ({{ textForm.volume }})</label>
            <input
              type="range"
              v-model="textForm.volume"
              min="1"
              max="100"
              class="range-input"
            />
          </div>
        </div>

        <div class="form-group">
          <div class="form-header">
            <label>音色选择</label>
            <div class="timbre-toggle">
              <span class="toggle-label-text">{{ usePublicTimbres ? '公共音色' : '私有音色' }}</span>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="usePublicTimbres"
                  @change="handleTimbreTypeChange"
                  class="toggle-input"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <LoadableSelect
            v-model="textForm.timbreId"
            :items="appConfig.digitalHumanTimbres || []"
            placeholder="请选择音色"
            empty-text="暂无音色"
            value-key="TimbreId"
            label-key="Name"
            :has-more="appConfig.timbrePagination?.hasMore || false"
            :loading="appConfig.timbrePagination?.loading || false"
            @load-more="emit('load-more-timbres')"
          />
          <!-- 开发模式下显示缓存状态 -->
          <div v-if="isDev && appConfig.timbreCache" class="cache-info">
            <small>缓存: {{ Object.keys(appConfig.timbreCache).length }} 个数字人</small>
          </div>
        </div>

        <button
          class="drive-btn text-drive-btn"
          :disabled="!canOperate || !textForm.content.trim()"
          @click="debouncedTextDrive"
        >
          <div class="loading-spinner" v-if="loading.textDrive"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {{ loading.textDrive ? "驱动中..." : "开始文本驱动" }}
        </button>
      </div>

      <!-- 动作驱动面板 -->
      <div class="drive-panel" v-show="activeTab === 'action'">
        <div class="form-group">
          <label>动作选择</label>
          <select v-model="actionForm.action" class="select-input" @change="handleActionSelect">
            <option value="">请选择动作</option>
            <option v-for="action in appConfig.digitalHumanActions || []" :key="action.Action" :value="action.Action">
              {{ action.Action }}
            </option>
          </select>
        </div>

        <button
          class="drive-btn action-drive-btn"
          :disabled="!canOperate || !actionForm.action.trim() || loading.actionDrive"
          @click="debouncedActionDrive"
        >
          <div class="loading-spinner" v-if="loading.actionDrive"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {{ loading.actionDrive ? "驱动中..." : "开始动作驱动" }}
        </button>
      </div>

      <!-- 音频驱动面板 -->
      <div class="drive-panel" v-show="activeTab === 'audio'">
        <div class="form-group">
          <label>音频URL</label>
          <input
            type="url"
            v-model="audioForm.url"
            placeholder="请输入音频文件URL（支持MP3和WAV格式）"
            class="url-input"
          />
        </div>

        <button
          class="drive-btn audio-drive-btn"
          :disabled="!canOperate || !audioForm.url.trim()"
          @click="handleAudioDrive"
        >
          <div class="loading-spinner" v-if="loading.audioDrive"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {{ loading.audioDrive ? "驱动中..." : "开始音频驱动" }}
        </button>
      </div>

      <!-- RTC流式音频驱动面板 -->
      <div class="drive-panel" v-show="activeTab === 'rtc'">
        <div class="form-group">
          <label>RoomId</label>
          <div class="select-input" style="background:#f5f5f5; color:#888;">{{ props.taskState.currentTask?.RoomId || '无' }}</div>
        </div>
        <div class="form-group">
          <label>PublishStreamId</label>
          <div class="select-input" style="background:#f5f5f5; color:#888;">{{ props.taskState.currentTask?.PublishStreamId || '无' }}</div>
        </div>
        <button
          class="drive-btn"
          :disabled="!canOperate || !props.taskState.currentTask?.RoomId || !props.taskState.currentTask?.PublishStreamId || loading.rtcDrive"
          @click="handleRtcDrive"
        >
          <div class="loading-spinner" v-if="loading.rtcDrive"></div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span v-if="loading.rtcDrive">驱动中...</span>
          <span v-else-if="isPublishing">停止RTC流式音频驱动</span>
          <span v-else>开始RTC流式音频驱动</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 桌面端样式 */
.control-desktop {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

/* 移动端样式 */
.control-mobile {
  display: flex;
  flex-direction: column;
  padding: 15px;
  gap: 15px;
  min-height: 100%;
}

/* 通用样式 */
h3 {
  margin: 0 0 15px 0;
  color: white;
  font-size: 16px;
  font-weight: 600;
}

/* 任务控制区 */
.task-section {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.task-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.task-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  min-width: 100px;
}

.create-btn {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  color: white;
}

.create-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.3);
}

.stop-btn {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
  color: white;
}

.stop-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 77, 79, 0.3);
}

.interrupt-btn {
  background: linear-gradient(135deg, #faad14, #ffc53d);
  color: white;
}

.interrupt-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(250, 173, 20, 0.3);
}

.task-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.task-btn svg {
  width: 16px;
  height: 16px;
}

/* 驱动控制区 */
.drive-section {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex: 1;
}

.tabs {
  display: flex;
  margin-bottom: 15px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px;
  gap: 4px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.tab-btn svg {
  width: 14px;
  height: 14px;
}

.drive-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
}

.text-input,
.url-input,
.select-input {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease;
}

.text-input:focus,
.url-input:focus,
.select-input:focus {
  border-color: rgba(255, 255, 255, 0.6);
}

.text-input::placeholder,
.url-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.char-count {
  align-self: flex-end;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.cache-info {
  align-self: flex-end;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}

.timbre-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.timbre-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-label-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.toggle-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.toggle-input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 32px;
  height: 16px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.toggle-input:checked + .toggle-slider {
  background: #1890ff;
}

.toggle-input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  z-index: 1;
  transition: all 0.3s ease;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.range-input {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
  outline: none;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.drive-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 10px;
}

.text-drive-btn {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
  color: white;
}

.audio-drive-btn {
  background: linear-gradient(135deg, #722ed1, #9254de);
  color: white;
}

.action-drive-btn {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  color: white;
}

.action-drive-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.3);
}

.drive-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.drive-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.drive-btn svg {
  width: 16px;
  height: 16px;
}

/* 加载动画 */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 动作预览样式 */
.action-preview {
  margin: 15px 0;
}

.action-preview label {
  display: block;
  margin-bottom: 8px;
  color: white;
  font-size: 13px;
  font-weight: 500;
}

.preview-container {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-video {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
}

.preview-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 15px 10px 8px;
}

.action-name {
  color: white;
  font-size: 12px;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .task-buttons {
    flex-direction: column;
  }

  .task-btn {
    flex: none;
  }

  /* 保持标签页水平布局，与PC端一致 */
  .tabs {
    flex-direction: row;
  }

  .tab-btn {
    font-size: 12px;
    padding: 6px 8px;
  }

  /* 移动端文本输入优化 */
  .text-input {
    min-height: 80px;
    font-size: 16px; /* 防止iOS自动缩放 */
  }

  .url-input {
    font-size: 16px; /* 防止iOS自动缩放 */
  }

  /* 移动端滑块优化 */
  .range-input {
    height: 6px;
  }

  .range-input::-webkit-slider-thumb {
    width: 20px;
    height: 20px;
  }

  /* 移动端驱动按钮优化 */
  .drive-btn {
    padding: 14px 20px;
    font-size: 16px;
    min-height: 48px; /* 确保足够的触摸目标 */
  }

  /* 移动端音色切换器优化 */
  .form-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .timbre-toggle {
    align-self: flex-end;
    gap: 6px;
  }

  .toggle-label-text {
    font-size: 12px;
    font-weight: 600;
  }

  .toggle-slider {
    width: 36px;
    height: 18px;
  }

  .toggle-slider::before {
    width: 14px;
    height: 14px;
    top: 2px;
    left: 2px;
  }

  .toggle-input:checked + .toggle-slider::before {
    transform: translateX(18px);
  }

  .toggle-text {
    font-size: 11px;
    font-weight: 600;
  }

  /* 移动端颜色对比度优化 */
  .control-mobile h3 {
    color: #2c3e50;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
  }

  .control-mobile label {
    color: #34495e;
    font-weight: 600;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.6);
  }

  .control-mobile .text-input,
  .control-mobile .url-input,
  .control-mobile .select-input {
    background: rgba(255, 255, 255, 0.9);
    color: #2c3e50;
    border: 1px solid rgba(52, 73, 94, 0.3);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .control-mobile .text-input::placeholder,
  .control-mobile .url-input::placeholder {
    color: rgba(52, 73, 94, 0.6);
  }

  .control-mobile .char-count {
    color: #7f8c8d;
  }

  .control-mobile .tab-btn {
    color: rgba(44, 62, 80, 0.8);
    font-weight: 600;
  }

  .control-mobile .tab-btn.active {
    background: rgba(52, 152, 219, 0.2);
    color: #2980b9;
  }

  /* 移动端动作预览优化 */
  .control-mobile .action-preview {
    margin: 12px 0;
  }

  .control-mobile .action-preview label {
    color: #34495e;
    font-weight: 600;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.6);
  }

  .control-mobile .preview-container {
    border: 1px solid rgba(52, 73, 94, 0.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .control-mobile .preview-video {
    height: 150px;
  }

  .control-mobile .preview-info {
    background: linear-gradient(transparent, rgba(44, 62, 80, 0.9));
  }

  .control-mobile .action-name {
    color: white;
    font-weight: 600;
  }
}
</style>
