
# P4-CAN Universal Unlock v3.29.3 BETA

The ultimate solution to have all features with using esp32-p4/c6 board + 3 x SN65HVD230 CAN Transceiver.    
All the features of the T2CAN-Universal unlock are included + the nag-killer.  

** Highlights:**  
- Nag-killer  
- Advanced EAP (Automatically activates the turn signal in noa)  
- EU unlock (Bypass R79 EU restriction)  
- Summon Unlock (+/-85m)  ESP32-P4 fix stabilty issue  
- Activate Tlssc, if not available in your region  
- Continuous AP  (experimental)  
- ISA chime Suppression  
- Country / Map Region Spoof  
- Vision Speed Control Settings  
- Pedal map settings  
- S3XY Button Bluetooth Support (need some fix)
- toggle to restore Confirm free lane change setting (doesn't work in EU use auto blinker)**.
- Option to Disable Driver Monitoring  
A valid EAP/FSD subscription is required for some features.  

Multiple operating modes supporting five vehicle profiles Model 3/Y/YL :  

- **Android Mobile dashboard** [Android APK](https://github.com/06066060606060/t2can-universal-unlock/releases/tag/android_1.2.1)  

## wiring
| Physical bus | Controller | TX | RX |
|---|---|---|---|
| CAN 1 BODY | TWAI 0 | GPIO20 | GPIO21 |
| CAN 2 CHASSIS | TWAI 1 | GPIO22 | GPIO23 |
| CAN 3 PARTY | TWAI 2 | GPIO26 | GPIO27 |

<img width="718" height="442" alt="ESP32-P4-WIRING" src="https://github.com/user-attachments/assets/7cbf03c8-ebb4-41c9-b624-cad1b8879684" />

## Build

### 本地离线实验室预览

在电脑上运行 `python3 tools/preview_offline_lab.py`，打开
`http://127.0.0.1:8765`，进入 **实验室 → TLSSC 离线模拟**。
模拟开关默认关闭，可逐步运行、暂停、重置并查看带时间戳的日志。
刷新页面会清除模拟状态，离开面板会暂停。

本地预览使用合成数据，不连接板子、车辆或 CAN 设备；模拟名称和状态不代表
真实车辆功能已经恢复。预览服务只绑定本机地址，拒绝所有写入请求，也不会
转发请求。离线模拟入口仅在本地文件或 HTTP 本机地址下显示。

本地检查：

```sh
node tests/test_tlssc_offline_lab.js
python3 tests/test_offline_preview.py
python3 tests/test_dashboard.py
node tests/test_dashboard.js
```

修改仪表盘后运行 `python3 tools/build_dashboard.py` 更新内嵌网页。

Use Arduino-ESP32 3.3.12 with `ESP32P4 Dev Module`, post-v3 silicon, 32 MB flash, `app5M_fat24M_32MB`, enabled PSRAM, Hardware CDC/JTAG and CDC on boot:

```text
esp32:esp32:esp32p4:ChipVariant=postv3,FlashSize=32M,PartitionScheme=app5M_fat24M_32MB,PSRAM=enabled,USBMode=hwcdc,CDCOnBoot=cdc,FlashMode=qio
```


Rrecommend setup for max performance and stabilty.  
ESP32-P4 + 3 x SN65HVD230  
with removed 120 ohms resistors & highspeed mode enabled

https://link.amazon/B05fkkBto  
https://link.amazon/B0eL8me5V


Check your ESP32-P4 chip revision and build for the correct version, V1.X or V3.X,  
 
<img width="295" height="337" alt="image" src="https://github.com/user-attachments/assets/31ea6408-9702-4741-8c8c-eb6e9a7402b7" />
  

<img width="165" height="254" alt="highspeed" src="https://github.com/user-attachments/assets/de1fab24-3905-4dbf-b603-205c5784e361" />
<img width="500" height="372" alt="ESP32-P4" src="https://github.com/user-attachments/assets/b2f7f3c3-9c50-4bff-a29d-fbed4a528866" />
  

### ☕ Support the Project 

[![Crypto](https://img.shields.io/badge/Crypto-Donate-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://tesla-mods.fkey.id/) [![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/donate/?hosted_button_id=Q2YMMMJYTAPJE)
<a href="https://www.buymeacoffee.com/xbmod" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" style="height: 30px !important;width: 108px !important;" ></a>

### Discord

Join the project Discord server:

https://discord.gg/euPbYG8Npc


## License

GNU GPL v3 or later. See [LICENSE](LICENSE).
