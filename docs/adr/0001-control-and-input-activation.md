# Control intake and explicit input activation / 控制入口与明确输入启用

HTTP 和 WebSocket 使用同一个控制 module 的 interface，adapter 只处理传输 framing。模式、脚本替换、配置变更和来源生命周期的不变量在统一实现中处理，避免同一个操作从不同入口产生不同动作。输入方式或脚本改变会关闭输入；解除急停不恢复动作。相比保留各入口独立规则，这会改变过去隐式续动的行为，但让用户授权与设备动作具有 locality。

HTTP and WebSocket use the same control module interface; adapters handle transport framing. Mode changes, script replacement, configuration updates and source lifecycle invariants live in one implementation, so different entry points cannot silently perform different motion. Changing input mode or script closes input; clearing emergency stop does not resume it. This intentionally replaces implicit continuation with locality between user authorization and motion.
