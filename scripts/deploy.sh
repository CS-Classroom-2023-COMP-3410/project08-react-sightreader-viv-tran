#!/bin/bash
ssh abcsightreader 'cd /opt/www/abcsightreader && git pull'
ssh abcsightreader 'sudo systemctl restart abcsightreader'
ssh abcsightreader 'sudo service nginx restart'
