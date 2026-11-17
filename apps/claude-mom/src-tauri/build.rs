fn main() {
    // tauri-build 默认只把应用清单嵌进可执行文件。测试二进制拿不到清单时，Windows 会按旧版
    // comctl32 加载，一启动就 STATUS_ENTRYPOINT_NOT_FOUND（缺少 TaskDialogIndirect）。
    // 所以关掉它的清单嵌入，改成给所有产物（含测试）嵌同一份清单（内容与 Tauri 默认的一致）。
    if std::env::var_os("CARGO_CFG_WINDOWS").is_some() {
        let attributes = tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("tauri-build 失败");
        match embed_resource::compile_for_everything("app.rc", embed_resource::NONE) {
            embed_resource::CompilationResult::Ok | embed_resource::CompilationResult::NotWindows => {}
            embed_resource::CompilationResult::Failed(reason) => panic!("嵌入 Windows 清单失败：{reason}"),
            embed_resource::CompilationResult::NotAttempted(reason) => {
                println!("cargo:warning=没能嵌入 Windows 清单（{reason}），程序对话框等功能可能不可用");
            }
        }
    } else {
        tauri_build::build();
    }
}
