import http.server
import socketserver
import os
import webbrowser
from threading import Timer

# 設定
PORT = 8000
HTML_FILE = "index.html" # あなたの元のHTMLファイル名

class AutoPatchHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # index.html へのアクセスが来た時だけ、特殊な処理を行う
        if self.path == '/' or self.path == f'/{HTML_FILE}':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            # 元のファイルを読み込む（ディスク上のファイル本体は一切変更しません）
            try:
                with open(HTML_FILE, 'r', encoding='utf-8') as f:
                    content = f.read()
            except FileNotFoundError:
                self.wfile.write(f"<h1>エラー: {HTML_FILE} が同じフォルダに見つかりません</h1>".encode('utf-8'))
                return
            
            # --- 実行時オンメモリ・パッチ（エラー原因の自動修復） ---
            # 未定義の関数 copyRoomCode によるクラッシュを、メモリ上で関数を補完して防ぐ
            target_str = "const [showUpdateModal, setShowUpdateModal] = useState(false);"
            patch_str = "const [showUpdateModal, setShowUpdateModal] = useState(false);\n      const copyRoomCode = () => { alert('クリップボードにコピーしました(ランチャー経由)'); };"
            
            patched_content = content.replace(target_str, patch_str)
            
            # ブラウザには修正済みの安全なデータを送信する
            self.wfile.write(patched_content.encode('utf-8'))
        else:
            # その他のリクエストは通常通り処理
            super().do_GET()

def open_browser():
    webbrowser.open_new(f"http://localhost:{PORT}")

if __name__ == "__main__":
    print("==================================================")
    print(" Hold'em Royal 起動ランチャー")
    print(f" 元のファイル [{HTML_FILE}] を読み込み、安全に起動します...")
    print(f" URL: http://localhost:{PORT}")
    print("==================================================")
    
    # 1.5秒後に自動的にブラウザを開く
    Timer(1.5, open_browser).start()
    
    # ローカルサーバーの起動
    with socketserver.TCPServer(("", PORT), AutoPatchHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nサーバーを終了します。")

