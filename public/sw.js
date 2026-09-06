self.addEventListener("push", function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: {
        url: data.url || "/tasks",
      },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/tasks";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Audit L9: so khớp theo pathname (không phải URL tuyệt đối) để không mở
      // cửa sổ thứ hai khi app đang mở ở /tasks?page=2 hoặc /tasks/...
      var targetPath = "/tasks";
      try {
        targetPath = new URL(urlToOpen, self.location.origin).pathname;
      } catch (e) {
        /* giữ mặc định */
      }
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (!("focus" in client)) continue;
        try {
          if (new URL(client.url).pathname === targetPath) {
            return client.focus();
          }
        } catch (e) {
          /* bỏ qua client không parse được */
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
