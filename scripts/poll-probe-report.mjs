import http from "http";

const deadline = Date.now() + 20_000;
let last = "";

const poll = () => {
  http
    .get("http://127.0.0.1:3000/api/socket/probe-report", (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (body !== last) {
          console.log(body);
          last = body;
        }

        if (body.includes('"ok":true')) {
          process.exit(0);
          return;
        }

        if (Date.now() > deadline) {
          process.exit(1);
          return;
        }

        setTimeout(poll, 1500);
      });
    })
    .on("error", (error) => {
      console.log(`ERROR=${error.message}`);
      if (Date.now() > deadline) {
        process.exit(1);
        return;
      }
      setTimeout(poll, 1500);
    });
};

poll();
