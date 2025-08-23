import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartinventory.app',
  appName: 'AI물품관리',
  webDir: '.',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      backgroundColor: "#667eea",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Camera: {
      permissions: {
        camera: "카메라 권한이 필요합니다. 영수증 촬영 및 물품 사진 등록에 사용됩니다.",
        photos: "사진 접근 권한이 필요합니다. 물품 이미지 등록에 사용됩니다."
      }
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#667eea",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#667eea"
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true
    }
  },
  android: {
    buildOptions: {
      keystorePath: 'release-key.keystore',
      keystoreAlias: 'smartinventory',
      releaseType: 'APK'
    },
    permissions: [
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'INTERNET',
      'ACCESS_NETWORK_STATE'
    ]
  },
  ios: {
    scheme: 'Smart Inventory',
    buildOptions: {
      teamId: 'YOUR_TEAM_ID',
      packageType: 'app-store'
    }
  }
};

export default config;