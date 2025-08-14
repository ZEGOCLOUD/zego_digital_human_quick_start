<script setup>
import { computed, watch, reactive } from "vue";
import { CONFIG } from "../config";

// 接收 props
const props = defineProps({
  show: Boolean,
  appConfig: Object,
  isMobile: Boolean,
  showMessage: Function,
  updateConfig: Function,
  settings: Object,
  updateSettings: Function,
});

// 定义 emits
const emit = defineEmits(["close"]);

const appInfo = reactive({
  appId: "",
  serverSecret: "",
});

// 数字人过滤选项
const filterOptions = reactive({
  showPublic: true,
  showPrivate: true,
});

// 计算属性
const drawerClass = computed(() => {
  return [
    "settings-drawer",
    { show: props.show },
    props.isMobile ? "mobile" : "desktop",
  ];
});

// 过滤后的数字人列表
const filteredDigitalHumans = computed(() => {
  if (!props.appConfig.digitalHumans) return [];

  return props.appConfig.digitalHumans.filter(digitalHuman => {
    if (filterOptions.showPublic && filterOptions.showPrivate) {
      return true; // 显示所有
    } else if (filterOptions.showPublic && !filterOptions.showPrivate) {
      return digitalHuman.IsPublic; // 只显示公共
    } else if (!filterOptions.showPublic && filterOptions.showPrivate) {
      return !digitalHuman.IsPublic; // 只显示私有
    } else {
      return false; // 都不显示
    }
  });
});

// 只在抽屉打开时初始化settings
watch(() => props.show, (show, oldShow) => {
  if (show && !oldShow) {
    const appId = props.appConfig.appId;
    const serverSecret = props.appConfig.serverSecret || "";
    props.updateSettings({ appId, serverSecret });

    // 初始化输入框的值
    if (appInfo.appId && appInfo.appId !== CONFIG.DEFAULT_APP_ID) {
      appInfo.appId = appId;
      appInfo.serverSecret = serverSecret;
    }
  }
});

// 选择数字人时自动切换到其第一个音色
const selectDigitalHuman = (digitalHuman) => {
  const selectedDigitalHumanId = digitalHuman.DigitalHumanId;
  const selectedTimbre = digitalHuman.Timbres?.[0] || null;
  const selectedTimbreId = selectedTimbre?.TimbreId || "";
  props.updateSettings({ selectedDigitalHumanId, selectedTimbreId });
  props.updateConfig({ selectedDigitalHuman: digitalHuman, selectedTimbre });
};

// 应用AppID设置
const applyAppId = () => {
  const appId = appInfo.appId.trim();
  const serverSecret = appInfo.serverSecret.trim();
  if (appId) {
    props.updateSettings({ appId })
    props.updateConfig({ appId, serverSecret });
    props.showMessage("success", "AppID和ServerSecret已更新");
  }
};

// 重置为默认AppID
const resetAppId = () => {
  const appId = CONFIG.DEFAULT_APP_ID;
  props.updateSettings({ appId, serverSecret: "" })
  props.updateConfig({ appId, serverSecret: "" });
  appInfo.appId = "";
  appInfo.serverSecret = "";
  props.showMessage("success", "已重置为默认体验账号");
};

// 关闭抽屉
const closeDrawer = () => {
  emit("close");
};
</script>

<template>
  <!-- 背景遮罩 -->
  <div class="drawer-overlay" v-show="show" @click="closeDrawer"></div>

  <!-- 抽屉主体 -->
  <div :class="drawerClass">
    <!-- 头部 -->
    <div class="drawer-header">
      <h2>配置设置</h2>
      <button class="close-btn" @click="closeDrawer">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="drawer-content">
      <!-- 账号设置 -->
      <section class="config-section">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L20.32 6L19 7H18.31L16 9H15V10L14 11H13V15H15L17 17V16H18.5L20 14.5L21 13V12L22 11V10L21 9Z"
            />
          </svg>
          <span>账号设置</span>
        </h3>
        <div class="form-group">
          <label>当前AppID</label>
          <div class="current-appid">
            <span>{{ settings.appId }}</span>
            <span class="badge" v-if="settings.appId === CONFIG.DEFAULT_APP_ID"
              >体验账号</span
            >
            <span class="badge private" v-else>自定义</span>
          </div>
        </div>
        <div class="form-group">
          <label>自定义AppID</label>
          <div class="appid-input-group">
            <input
              type="text"
              v-model="appInfo.appId"
              placeholder="请输入您的AppID"
              class="appid-input"
            />
          </div>
        </div>
        <div class="form-group">
          <label>自定义ServerSecret（仅测试使用，请勿将此字段暴露在前端环境中）</label>
          <div class="appid-input-group">
            <input
              type="password"
              v-model="appInfo.serverSecret"
              placeholder="请输入您的ServerSecret"
              class="appid-input"
            />
          </div>
        </div>
        <button class="apply-btn full-width" @click="applyAppId" :disabled="!appInfo.appId.trim()">
          <span>应用设置</span>
        </button>
        <button class="reset-btn" @click="resetAppId">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22S22 17.52 22 12S17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
            />
          </svg>
          <span>重置为默认体验账号</span>
        </button>
      </section>
      <!-- 数字人选择区 -->
      <section class="config-section">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C14.21 2 16 3.79 16 6S14.21 10 12 10 8 8.21 8 6 9.79 2 12 2M21 9V7L20.32 6L19 7H18.31L16 9H15V10L14 11H13V15H15L17 17V16H18.5L20 14.5L21 13V12L22 11V10L21 9M12 11C14.78 11 18 12.79 18 16V20H6V16C6 12.79 9.22 11 12 11Z"/>
          </svg>
          <span>数字人形象选择</span>
        </h3>

        <!-- 过滤选项 -->
        <div class="filter-options">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="filterOptions.showPublic"
              class="filter-checkbox"
            />
            <span class="checkbox-text">公共数字人</span>
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="filterOptions.showPrivate"
              class="filter-checkbox"
            />
            <span class="checkbox-text">私有数字人</span>
          </label>
        </div>

        <div class="digital-human-grid" v-if="filteredDigitalHumans.length > 0">
          <div
            v-for="digitalHuman in filteredDigitalHumans"
            :key="digitalHuman.DigitalHumanId"
            class="digital-human-card"
            :class="{ selected: settings.selectedDigitalHumanId === digitalHuman.DigitalHumanId }"
            @click="selectDigitalHuman(digitalHuman)"
          >
            <img :src="digitalHuman.AvatarUrl" :alt="digitalHuman.Name" />
            <div class="card-info">
              <h4>{{ digitalHuman.Name }}</h4>
              <span class="badge" v-if="digitalHuman.IsPublic">公共</span>
              <span class="badge private" v-else>私有</span>
            </div>
            <div class="selected-indicator" v-if="settings.selectedDigitalHumanId === digitalHuman.DigitalHumanId">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
          </div>
        </div>
        <div class="digital-human-card" v-else style="opacity: 0.7;">
          <div class="card-info">
            <h4>暂无符合条件的数字人形象</h4>
            <span>请调整过滤条件或先在控制台创建数字人形象</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000;
  transition: opacity 0.3s ease;
}

.settings-drawer {
  position: fixed;
  top: 0;
  right: -400px;
  width: 400px;
  height: 100vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  z-index: 1001;
  transition: right 0.3s ease;
  display: flex;
  flex-direction: column;
}

.settings-drawer.show {
  right: 0;
}

.settings-drawer.mobile {
  width: 100vw;
  right: -100vw;
}

.settings-drawer.mobile.show {
  right: 0;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
}

.drawer-header h2 {
  margin: 0;
  color: #333;
  font-size: 20px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.config-section {
  margin-bottom: 30px;
}

.config-section h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}

.config-section h3 svg {
  width: 18px;
  height: 18px;
  color: #1890ff;
}

/* 过滤选项样式 */
.filter-options {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  color: #333;
}

.filter-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #1890ff;
  cursor: pointer;
}

.checkbox-text {
  font-weight: 500;
}

.digital-human-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 15px;
}

.digital-human-card {
  position: relative;
  background: white;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.digital-human-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #1890ff;
}

.digital-human-card.selected {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.05);
}

.digital-human-card img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 8px;
}

.card-info {
  text-align: center;
}

.card-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.badge {
  display: inline-block;
  padding: 2px 6px;
  background: #52c41a;
  color: white;
  font-size: 10px;
  border-radius: 4px;
  font-weight: 500;
}

.badge.private {
  background: #faad14;
}

.selected-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: #1890ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.selected-indicator svg {
  width: 14px;
  height: 14px;
}

.form-group {
  margin-bottom: 15px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: #333;
  font-size: 13px;
  font-weight: 500;
}

.current-appid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-family: "Courier New", monospace;
  font-size: 12px;
  color: #666;
}

.appid-input-group {
  display: flex;
  gap: 8px;
}

.appid-input,
.number-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  background: white;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.appid-input:focus,
.number-input:focus {
  border-color: #1890ff;
}

.apply-btn {
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.apply-btn:hover:not(:disabled) {
  background: #40a9ff;
  transform: translateY(-1px);
}

.apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #ff4d4f;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  justify-content: center;
}

.reset-btn:hover {
  background: #ff7875;
  transform: translateY(-1px);
}

.reset-btn svg {
  width: 16px;
  height: 16px;
}

.reset-btn.apply-blue {
  background: #1890ff;
  color: white;
}
.reset-btn.apply-blue:hover {
  background: #40a9ff;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .digital-human-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .drawer-content {
    padding: 15px;
  }

  .config-section {
    margin-bottom: 25px;
  }

  .filter-options {
    flex-direction: column;
    gap: 12px;
    padding: 10px;
  }
}

/* 滚动条样式 */
.drawer-content::-webkit-scrollbar {
  width: 6px;
}

.drawer-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.drawer-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
}

.drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
