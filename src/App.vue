<script setup>
import { ref, reactive, onMounted, computed, provide, watch } from "vue";
import { ZegoExpressEngine } from 'zego-express-engine-webrtc';
import { device } from "./utils";
import { CONFIG } from "./config";
import { digitalHumanAPI } from "./utils/api";
import MessageToast from "./components/MessageToast.vue";
import HeaderConfig from "./components/HeaderConfig.vue";
import DigitalHumanDisplay from "./components/DigitalHumanDisplay.vue";
import ControlPanel from "./components/ControlPanel.vue";
import SettingsDrawer from "./components/SettingsDrawer.vue";
import { setAppId, setServerSecret } from "./utils/api";

// 全局初始化 zg 实例并 provide
const zg = new ZegoExpressEngine(Number(CONFIG.DEFAULT_APP_ID), CONFIG.DEFAULT_SERVER);
provide('zg', zg);

// 响应式状态
const deviceType = ref(device.getDeviceType());
const isMobile = computed(() => deviceType.value === "mobile");
const showSettings = ref(false);
const showMobileControls = ref(false); // 移动端默认隐藏控制面板

// 获取布局配置
const getLayoutConfig = (type) => {
  const configMap = {
    mobile: CONFIG.LAYOUT_CONFIG.MOBILE,
    tablet: CONFIG.LAYOUT_CONFIG.TABLET,
    desktop: CONFIG.LAYOUT_CONFIG.DESKTOP,
    "large-desktop": CONFIG.LAYOUT_CONFIG.LARGE_DESKTOP,
  };
  return configMap[type] || CONFIG.LAYOUT_CONFIG.DESKTOP;
};

// 表单数据
const settings = reactive({
  selectedDigitalHumanId: "",
  selectedTimbreId: "",
  appId: CONFIG.DEFAULT_APP_ID,
});

// 应用配置状态
const appConfig = reactive({
  appId: CONFIG.DEFAULT_APP_ID,
  serverSecret: "",
  selectedDigitalHuman: null,
  selectedTimbre: null,
  digitalHumans: [],
  digitalHumanActions: [],
  digitalHumanTimbres: [],
  videoConfig: { ...CONFIG.VIDEO_CONFIG },
  layoutConfig: getLayoutConfig(deviceType.value),
  // 音色分页相关状态
  timbrePagination: {
    offset: 0,
    limit: 20,
    hasMore: true,
    loading: false,
    total: 0
  },
  // 音色缓存 - 按数字人ID缓存音色数据
  timbreCache: {},
  // 音色类型：true为公共音色，false为私有音色
  usePublicTimbres: true
});

// 任务状态
const taskState = reactive({
  currentTask: null,
  taskStatus: null,
  driveList: [],
  isStreaming: false,
});

// 消息提示状态
const messageState = reactive({
  show: false,
  type: "info", // info, success, warning, error
  message: "",
});

// 计算属性
const layoutClass = computed(() => {
  return `layout-${deviceType.value}`;
});

// 监听窗口大小变化
const handleResize = () => {
  const newDeviceType = device.getDeviceType();
  if (newDeviceType !== deviceType.value) {
    deviceType.value = newDeviceType;
    appConfig.layoutConfig = getLayoutConfig(newDeviceType);
  }
};

// 显示消息提示
const showMessage = (type, message, duration = 3000) => {
  messageState.type = type;
  messageState.message = message;
  messageState.show = true;

  setTimeout(() => {
    messageState.show = false;
  }, duration);
};

// 更新应用配置
const updateConfig = (newConfig) => {
  if (appConfig.appId !== newConfig.appId) {
    if (newConfig.appId && newConfig.appId === CONFIG.DEFAULT_APP_ID) {
      setAppId(CONFIG.DEFAULT_APP_ID);
      setServerSecret("");
    } else {
      setAppId(newConfig.appId);
      setServerSecret(newConfig.serverSecret);
    }
  }
  Object.assign(appConfig, newConfig);

  if (typeof appConfig.selectedDigitalHuman === 'boolean') appConfig.usePublicTimbres = appConfig.selectedDigitalHuman?.IsPublic;
};

// 更新表单数据
const updateSettings = (newSettings) => {
  Object.assign(settings, newSettings);
};

// 更新任务状态
const updateTaskState = (newState) => {
  Object.assign(taskState, newState);
};

const getDigitalHumanInfo = async () => {
  const res = await digitalHumanAPI.getDigitalHumanInfo(appConfig.selectedDigitalHuman?.DigitalHumanId);
  appConfig.digitalHumanActions = res?.Data.Actions;
  console.log("getDigitalHumanInfo 返回：", res);
}

const getTimbreList = async (isLoadMore = false) => {
  // 根据音色类型决定digitalHumanId
  const digitalHumanId = appConfig.usePublicTimbres ? '' : (appConfig.selectedDigitalHuman?.DigitalHumanId || '');

  if (!appConfig.usePublicTimbres && !digitalHumanId) {
    console.warn('数字人ID为空，无法获取私有音色列表');
    return;
  }

  // 创建缓存键，公共音色使用特殊键
  const cacheKey = appConfig.usePublicTimbres ? 'public_timbres' : digitalHumanId;

  if (!isLoadMore) {
    // 重置分页状态
    appConfig.timbrePagination.offset = 0;
    appConfig.timbrePagination.hasMore = true;
    appConfig.digitalHumanTimbres = [];

    // 检查缓存中是否已有该类型的音色数据
    if (appConfig.timbreCache[cacheKey]) {
      const cachedData = appConfig.timbreCache[cacheKey];
      appConfig.digitalHumanTimbres = cachedData.timbres || [];
      appConfig.timbrePagination.offset = cachedData.offset || 0;
      appConfig.timbrePagination.hasMore = cachedData.hasMore || false;
      appConfig.timbrePagination.total = cachedData.total || 0;

      // 自动选中第一个音色
      if (appConfig.digitalHumanTimbres.length > 0) {
        const selectedTimbre = appConfig.digitalHumanTimbres[0];
        const selectedTimbreId = selectedTimbre?.TimbreId || "";
        appConfig.selectedTimbre = selectedTimbre;
        settings.selectedTimbreId = selectedTimbreId;
      }

      console.log(`从缓存加载${appConfig.usePublicTimbres ? '公共' : '私有'}音色数据，缓存键: ${cacheKey}`);
      return;
    }
  }

  if (!appConfig.timbrePagination.hasMore || appConfig.timbrePagination.loading) {
    return;
  }

  appConfig.timbrePagination.loading = true;

  try {
    const res = await digitalHumanAPI.getTimbreList(
      digitalHumanId,
      appConfig.timbrePagination.offset,
      appConfig.timbrePagination.limit
    );

    const newTimbres = res?.Data?.Timbres || [];
    const total = res?.Data?.Total || 0;

    if (isLoadMore) {
      // 追加数据
      appConfig.digitalHumanTimbres.push(...newTimbres);
    } else {
      // 替换数据
      appConfig.digitalHumanTimbres = newTimbres;
    }

    // 更新分页状态
    appConfig.timbrePagination.offset += newTimbres.length;
    appConfig.timbrePagination.total = total;
    appConfig.timbrePagination.hasMore = appConfig.timbrePagination.offset < total;

    // 缓存数据
    appConfig.timbreCache[cacheKey] = {
      timbres: [...appConfig.digitalHumanTimbres],
      offset: appConfig.timbrePagination.offset,
      hasMore: appConfig.timbrePagination.hasMore,
      total: appConfig.timbrePagination.total
    };

    console.log(`缓存${appConfig.usePublicTimbres ? '公共' : '私有'}音色数据，缓存键: ${cacheKey}，音色数量: ${appConfig.digitalHumanTimbres.length}`);

    // 如果是首次加载，自动选中第一个音色
    if (!isLoadMore && appConfig.digitalHumanTimbres.length > 0) {
      const selectedTimbre = appConfig.digitalHumanTimbres[0];
      const selectedTimbreId = selectedTimbre?.TimbreId || "";
      appConfig.selectedTimbre = selectedTimbre;
      settings.selectedTimbreId = selectedTimbreId;
    }

    console.log("getTimbreList 返回：", res);
  } catch (error) {
    console.error("获取音色列表失败：", error);
    showMessage("error", "获取音色列表失败");
  } finally {
    appConfig.timbrePagination.loading = false;
  }
}

// 加载更多音色
const loadMoreTimbres = async () => {
  await getTimbreList(true);
}

// 处理音色类型切换
const handleTimbreTypeChange = (usePublicTimbres) => {
  appConfig.usePublicTimbres = usePublicTimbres;

  // 清空当前音色选择
  appConfig.selectedTimbre = null;
  settings.selectedTimbreId = "";

  // 重置分页状态并重新加载音色列表
  appConfig.timbrePagination.offset = 0;
  appConfig.timbrePagination.hasMore = true;
  appConfig.digitalHumanTimbres = [];

  // 重新获取音色列表
  getTimbreList();

  console.log(`切换到${usePublicTimbres ? '公共' : '私有'}音色`);
};

// 清理音色缓存
const clearTimbreCache = (digitalHumanId = null) => {
  if (digitalHumanId) {
    // 清理指定数字人的缓存
    delete appConfig.timbreCache[digitalHumanId];
    console.log(`清理数字人 ${digitalHumanId} 的音色缓存`);
  } else {
    // 清理所有缓存
    appConfig.timbreCache = {};
    console.log('清理所有音色缓存');
  }
}

// 获取缓存状态信息
const getTimbreCacheInfo = () => {
  const cacheKeys = Object.keys(appConfig.timbreCache);
  return {
    cachedDigitalHumans: cacheKeys,
    cacheCount: cacheKeys.length,
    cacheSize: JSON.stringify(appConfig.timbreCache).length
  };
}

const getDigitalHumanList = async () => {
  try {
    const res = await digitalHumanAPI.getDigitalHumanList();

    const digitalHumans = res?.Data?.DigitalHumans || [];
    const publicDigitalHumans = [];
    const privateDigitalHumans = [];
    digitalHumans.forEach(dh => {
      if (dh.IsPublic) {
        publicDigitalHumans.push(dh);
      } else {
        privateDigitalHumans.push(dh);
      }
    })
    console.log('getDigitalHumanList', publicDigitalHumans);
    if (publicDigitalHumans.length > 0) {
      appConfig.digitalHumans = publicDigitalHumans;
      // 自动选中第一个数字人和第一个音色
      if (appConfig.digitalHumans.length > 0) {
        const selectedDigitalHuman = appConfig.digitalHumans[0]
        const selectedDigitalHumanId = selectedDigitalHuman.DigitalHumanId

        settings.selectedDigitalHumanId = selectedDigitalHumanId;
        appConfig.selectedDigitalHuman = selectedDigitalHuman;
      }
    }
  } catch (error) {
    console.error("获取数字人列表失败：", err);
  }
}

const init = async () => {
  window.addEventListener("resize", handleResize);
  await getDigitalHumanList();
}

const fetchDigitalHumanData = async () => {
  await getDigitalHumanInfo();

  // 清空音色缓存，确保获取最新的音色数据
  const currentDigitalHumanId = appConfig.selectedDigitalHuman?.DigitalHumanId;
  if (currentDigitalHumanId) {
    delete appConfig.timbreCache[currentDigitalHumanId];
    console.log(`清空数字人 ${currentDigitalHumanId} 的音色缓存`);
  }

  // 重置音色分页状态并重新加载音色列表
  appConfig.timbrePagination.offset = 0;
  appConfig.timbrePagination.hasMore = true;
  appConfig.digitalHumanTimbres = [];
  await getTimbreList();
}

// 组件挂载
onMounted(() => {
  init();
});

watch(() => appConfig.appId, () => {
  getDigitalHumanList();
})

watch(() => appConfig.selectedDigitalHuman, () => {
  if (appConfig.selectedDigitalHuman) fetchDigitalHumanData()
})
</script>

<template>
  <div id="app" :class="layoutClass">
    <!-- 头部配置区 -->
    <HeaderConfig
      :appConfig="appConfig"
      :taskState="taskState"
      :isMobile="isMobile"
      :deviceType="deviceType"
      :showMessage="showMessage"
      :updateTaskState="updateTaskState"
      @toggle-settings="showSettings = !showSettings"
      @toggle-mobile-controls="showMobileControls = !showMobileControls"
    />

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 数字人展示区 -->
      <section class="display-section">
        <DigitalHumanDisplay
          :appConfig="appConfig"
          :taskState="taskState"
          :isMobile="isMobile"
          :showMessage="showMessage"
          :deviceType="deviceType"
          :updateTaskState="updateTaskState"
        />
      </section>

      <!-- 控制面板 -->
      <section
        class="control-section"
        v-if="!isMobile || showMobileControls"
        :class="{ show: showMobileControls }"
      >
        <ControlPanel
          :appConfig="appConfig"
          :taskState="taskState"
          :isMobile="isMobile"
          :showMessage="showMessage"
          :updateTaskState="updateTaskState"
          @load-more-timbres="loadMoreTimbres"
          @timbre-type-change="handleTimbreTypeChange"
        />
      </section>
    </main>

    <!-- 设置抽屉 -->
    <SettingsDrawer
      :appConfig="appConfig"
      :settings="settings"
      :isMobile="isMobile"
      :showMessage="showMessage"
      :updateConfig="updateConfig"
      :updateSettings="updateSettings"
      :show="showSettings"
      @close="showSettings = false"
    />

    <!-- 消息提示 -->
    <MessageToast
      :show="messageState.show"
      :type="messageState.type"
      :message="messageState.message"
    />
  </div>
</template>

<style scoped>
/* 全局样式重置 - 防止移动端滚动 */
:global(html), :global(body) {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden; /* 防止页面滚动 */
}

:global(#app) {
  height: 100vh;
  overflow: hidden;
}

#app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  position: relative;
  overflow-x: hidden;
}

/* 主内容区布局 */
.main-content {
  display: flex;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  height: calc(100vh - 80px);
  justify-content: space-between;
  gap: 20px;
  padding: 0 20px;
}

.display-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.control-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0;
}

/* 移动端布局 */
.layout-mobile {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 改为固定高度 */
  overflow: hidden; /* 确保不产生滚动 */
  position: fixed; /* 固定定位，防止滚动 */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.layout-mobile .main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0;
  gap: 0;
  overflow: hidden;
  max-width: 100vw;
  height: calc(100vh - 80px); /* 减去头部高度 */
  min-height: 0; /* 允许收缩 */
}

.layout-mobile .display-section {
  flex: 1;
  padding: 0;
  min-height: 0; /* 允许收缩 */
  overflow: hidden; /* 防止内容溢出 */
}

.layout-mobile .control-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 85vh;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 20px 20px 0 0;
  z-index: 100;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  padding: 20px;
}

.layout-mobile .control-section.show {
  transform: translateY(0);
}

/* 平板端布局 */
.layout-tablet {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}

.layout-tablet .main-content {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
  max-width: 100vw;
  height: calc(100vh - 80px);
}

.layout-tablet .display-section {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.layout-tablet .control-section {
  flex: 0 0 auto;
  max-height: 40vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

/* 桌面端布局 */
.layout-desktop .main-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  height: calc(100vh - 80px);
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
}

.layout-desktop .display-section {
  flex: 0 0 400px;
  max-width: 400px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.layout-desktop .control-section {
  flex: 1;
  max-width: 600px;
}

/* 大桌面端布局 */
.layout-large-desktop .main-content {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  height: calc(100vh - 80px);
  justify-content: space-between;
  gap: 32px;
  padding: 20px 32px;
}

.layout-large-desktop .display-section {
  flex: 0 0 450px;
  max-width: 450px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.layout-large-desktop .control-section {
  flex: 1;
  max-width: 700px;
}

/* 响应式断点 */
@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
    width: 100vw;
    min-width: 0;
    height: auto;
    padding: 0;
    justify-content: flex-start;
    max-width: 100vw;
  }

  .display-section {
    width: 100vw;
    max-width: 100vw;
    padding: 0;
    margin: 0;
    flex: 1;
    min-height: 0;
  }

  .control-section {
    width: 100vw;
    max-width: 100vw;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 20px 20px 0 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px);
    z-index: 100;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateY(100%);
    max-height: 85vh;
    overflow-y: auto;
  }

  .control-section.show {
    transform: translateY(0);
  }

  /* 头部适配 */
  .header-mobile {
    position: sticky;
    top: 0;
    z-index: 101;
    background: inherit;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .main-content {
    width: 100%;
    max-width: 100vw;
    padding: 16px;
    gap: 16px;
  }

  .display-section {
    flex: 1;
    min-width: 0;
  }

  .control-section {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }
}

@media (min-width: 1025px) and (max-width: 1440px) {
  .main-content {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    gap: 24px;
  }

  .display-section {
    flex: 0 0 400px;
    max-width: 400px;
  }

  .control-section {
    flex: 1;
    max-width: 600px;
  }
}

@media (min-width: 1441px) {
  .main-content {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 32px;
    gap: 32px;
  }

  .display-section {
    flex: 0 0 450px;
    max-width: 450px;
  }

  .control-section {
    flex: 1;
    max-width: 700px;
  }
}

/* 滚动条样式 */
.control-section::-webkit-scrollbar {
  width: 6px;
}

.control-section::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.control-section::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
}

.control-section::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* 动画效果 */
.main-content {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.display-section,
.control-section {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 高分辨率屏幕优化 */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  .control-section {
    border-radius: 12px;
  }

  .layout-mobile .control-section {
    border-radius: 16px 16px 0 0;
  }
}

/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .main-content,
  .display-section,
  .control-section {
    transition: none;
  }

  .layout-mobile .control-section {
    transition: none;
  }
}
</style>
