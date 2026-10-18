FROM postgres:17

RUN apt-get update \
 && apt-get install -y --no-install-recommends cron rclone ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Karachi
COPY backup.sh restore-test.sh entrypoint.sh /usr/local/bin/
COPY crontab /etc/deepkhata-crontab
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh /usr/local/bin/entrypoint.sh \
 && mkdir -p /backups/daily /backups/weekly

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
